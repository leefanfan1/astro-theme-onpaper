import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'parse5'
import postcss from 'postcss'
import { create } from 'fontkitten'
import fontverter from 'fontverter'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const original = []
for (const filename of await readdir(resolve(dist, '_astro'))) {
  if (!filename.endsWith('.css')) continue
  postcss.parse(await readFile(resolve(dist, '_astro', filename), 'utf8')).walkAtRules('font-face', rule => {
    const props = Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]))
    const family = props['font-family']?.replaceAll(/["']/g, '')
    if (!['Noto Serif SC Variable', 'Newsreader'].includes(family)) return
    const path = props.src.match(/url\(['"]?([^'"\)]+)/)[1]
    original.push({ family, style: props['font-style'], range: props['unicode-range'], path: resolve(dist, '.' + path) })
  })
}
const fonts = new Map(), verified = new Set()
async function font(path) {
  if (!fonts.has(path)) fonts.set(path, create(await fontverter.convert(await readFile(path), 'sfnt')))
  return fonts.get(path)
}
function includes(range, code) {
  return range.split(',').some(part => {
    const [a, b = a] = part.trim().replace(/^U\+/i, '').split('-')
    return code >= parseInt(a.replaceAll('?', '0'), 16) && code <= parseInt(b.replaceAll('?', 'F'), 16)
  })
}
async function* pages(directory) {
  for (const item of await readdir(directory, {withFileTypes:true})) {
    if(item.isDirectory())yield*pages(resolve(directory,item.name))
    else if(item.name.endsWith('.html'))yield resolve(directory,item.name)
  }
}
let pageCount = 0, glyphCount = 0
for await (const page of pages(dist)) {
  const html = await readFile(page, 'utf8')
  const nodes = []
  function walk(node) { nodes.push(node); for (const child of node.childNodes ?? []) walk(child) }
  walk(parse(html))
  const style = nodes.find(n => n.tagName === 'style' && n.attrs.some(a => a.name === 'data-onpaper-page-fonts'))
  assert.ok(style, page)
  const links = nodes.filter(n => n.tagName === 'link' && n.attrs.some(a => a.name === 'data-onpaper-font'))
  const urls = new Set(links.map(n => n.attrs.find(a => a.name === 'href').value))
  assert.ok(urls.size > 0)
  assert.equal(html.includes('data-onpaper-legacy-font'), false)
  const rules = []
  postcss.parse(style.childNodes.map(n => n.value).join('')).walkAtRules('font-face', rule => {
    rules.push(Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value])))
  })
  for (const rule of rules) {
    const url = rule.src.match(/url\(['"]?([^'"\)]+)/)[1]
    assert.ok(urls.has(url))
    if (verified.has(url)) continue
    verified.add(url)
    const codes = rule['unicode-range'].split(',').map(range => parseInt(range.slice(2), 16))
    const latin = rule['font-family'].includes('OnPaper Latin ')
    const source = original.find(face => face.family === (latin ? 'Newsreader' : 'Noto Serif SC Variable')
      && face.style === rule['font-style'] && codes.every(code => includes(face.range, code)))
    assert.ok(source, url)
    const full = await font(source.path), subset = await font(resolve(dist, '.' + url))
    assert.deepEqual(subset.variationAxes, full.variationAxes, url + ': variable weights changed')
    for (const key of ['unitsPerEm', 'ascent', 'descent', 'lineGap']) assert.equal(subset[key], full[key], key)
    for (const weight of (latin ? [200, 400, 600, 800] : [200, 400, 600, 900])) {
      for (const opsz of (latin ? [6, 18, 72] : [undefined])) {
        const a = full.getVariation({ wght: weight, ...(opsz ? { opsz } : {}) }), b = subset.getVariation({ wght: weight, ...(opsz ? { opsz } : {}) })
        for (const code of codes) {
          assert.equal(b.hasGlyphForCodePoint(code), a.hasGlyphForCodePoint(code))
          if (!a.hasGlyphForCodePoint(code)) continue
          const x = a.glyphForCodePoint(code), y = b.glyphForCodePoint(code)
          assert.equal(y.advanceWidth, x.advanceWidth, url + ': width changed at ' + weight)
          assert.deepEqual(y.path.commands, x.path.commands, url + ': outline changed at ' + weight)
          glyphCount++
        }
      }
    }
  }
  pageCount++
}
console.log('PASS: '+pageCount+' pages preload '+verified.size+' smaller font files; '+glyphCount+' glyph/weight comparisons preserve axes, metrics and outlines')
