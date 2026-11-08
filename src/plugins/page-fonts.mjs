import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { parse } from 'parse5'
import postcss from 'postcss'
import subsetFont from 'subset-font'

const FAMILY = 'Noto Serif SC Variable'
const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'fangsong'])
const familyNames = value => value.split(',').map(name => name.trim().replace(/^['"]|['"]$/g, ''))
const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20)

const ranges = new Map()
function contains(range, code) {
  let parsed = ranges.get(range)
  if (!parsed) {
    parsed = { intervals: range.split(',').map(part => {
      const [start, end = start] = part.trim().replace(/^U\+/i, '').split('-')
      return [parseInt(start.replaceAll('?', '0'), 16), parseInt(end.replaceAll('?', 'F'), 16)]
    }), matches: new Map() }
    ranges.set(range, parsed)
  }
  if (!parsed.matches.has(code)) parsed.matches.set(code, parsed.intervals.some(([start, end]) => code >= start && code <= end))
  return parsed.matches.get(code)
}

function pageText(html) {
  const characters = new Set()
  const add = text => { for (const character of text) characters.add(character) }
  function walk(node, inBody = false) {
    if (['script', 'style', 'noscript'].includes(node.tagName)) return
    inBody ||= node.tagName === 'body'
    if (inBody) {
      if (node.nodeName === '#text') add(node.value)
      for (const attr of node.attrs ?? []) if (['placeholder', 'title', 'alt'].includes(attr.name)) add(attr.value)
    }
    for (const child of node.childNodes ?? []) walk(child, inBody)
  }
  walk(parse(html))
  return [...characters].sort((a, b) => a.codePointAt(0) - b.codePointAt(0))
}

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

export function pageFontIntegration(fonts) {
  return {
    name: 'onpaper-page-fonts',
    hooks: {
      'astro:build:generated': async ({ dir, logger }) => {
        if (![fonts.body, fonts.display].some(value => familyNames(value).includes(FAMILY))) return
        const output = fileURLToPath(dir)
        const faces = []
        for (const entry of await readdir(join(output, '_astro'))) {
          if (!entry.endsWith('.css')) continue
          const css = postcss.parse(await readFile(join(output, '_astro', entry), 'utf8'))
          css.walkAtRules('font-face', rule => {
            const properties = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
            const family = familyNames(properties['font-family'] ?? '')[0]
            const url = properties.src?.match(/url\(\s*['"]?([^'"\)\s]+)/)?.[1]
            if (url && properties['unicode-range']) faces.push({ ...properties, family, url: url.startsWith('/') ? new URL('.' + url, dir) : new URL(url, new URL('_astro/' + entry, dir)) })
          })
        }
        const noto = faces.filter(face => face.family === FAMILY)
        if (!noto.length) return
        const latin = faces.filter(face => face.family === 'Newsreader')
        const latinFirst = [fonts.body, fonts.display].every(value => {
          const names = familyNames(value)
          return names.indexOf('Newsreader') >= 0 && names.indexOf('Newsreader') < names.indexOf(FAMILY)
        })
        const destination = join(output, 'fonts', 'pages')
        const cache = new URL('../../node_modules/.cache/onpaper-fonts/', import.meta.url)
        await Promise.all([mkdir(destination, { recursive: true }), mkdir(cache, { recursive: true })])
        const buffers = new Map()
        const subsets = new Map()
        let count = 0
        for await (const path of files(output)) {
          if (!path.endsWith('.html')) continue
          const html = await readFile(path, 'utf8')
          const characters = pageText(html).filter(character => !latinFirst || !latin.some(face => contains(face['unicode-range'], character.codePointAt(0))))
          const alias = 'OnPaper Page ' + hash(characters.join(''))
          const rules = [], links = [], covered = []
          for (const face of noto) {
            const text = characters.filter(character => contains(face['unicode-range'], character.codePointAt(0))).join('')
            if (!text) continue
            if (!buffers.has(face.url.href)) buffers.set(face.url.href, await readFile(face.url))
            const source = buffers.get(face.url.href)
            // Keep every variation axis, layout feature and hint from the source.
            const key = hash(Buffer.concat([source, Buffer.from(text), Buffer.from('subset-v1')]))
            const filename = 'noto-serif-sc-' + key + '.woff2'
            if (!subsets.has(key)) {
              let buffer
              try { buffer = await readFile(new URL(filename, cache)) }
              catch (error) {
                if (error.code !== 'ENOENT') throw error
                buffer = await subsetFont(source, text, { targetFormat: 'woff2' })
                await writeFile(new URL(filename, cache), buffer)
              }
              await writeFile(join(destination, filename), buffer)
              subsets.set(key, true)
            }
            const href = '/fonts/pages/' + filename
            const range = [...text].map(character => 'U+' + character.codePointAt(0).toString(16)).join(',')
            rules.push('@font-face{font-family:"' + alias + '";src:url("' + href + '") format("woff2");font-style:' + (face['font-style'] || 'normal') + ';font-weight:' + (face['font-weight'] || 'normal') + ';font-display:block;unicode-range:' + range + '}')
            links.push('<link rel="preload" as="font" type="font/woff2" crossorigin href="' + href + '" data-onpaper-font>')
            covered.push(text)
          }
          if (!rules.length) continue
          for (const [property, value] of [['body', fonts.body], ['display', fonts.display]]) {
            const families = familyNames(value).flatMap(family => family === FAMILY ? [alias, family] : [family]).map(family => genericFamilies.has(family) ? family : JSON.stringify(family)).join(',')
            rules.push(':root{--font-' + property + '-web:' + families + '}')
          }
          const style = '<style data-onpaper-page-fonts data-characters="' + escapeAttribute(covered.join('')) + '">' + rules.join('') + '</style>'
          // The preload scanner can start these requests directly from the head.
          // Font definitions stay after theme tokens so the page family wins.
          const updated = html.replace(/<link\b[^>]*data-onpaper-legacy-font[^>]*>/g, '')
            .replace(/(<meta[^>]+name="viewport"[^>]*>)/, '$1' + links.join(''))
            .replace('</head>', style + '</head>')
          await writeFile(path, updated)
          count++
        }
        logger.info('Prepared original variable font subsets for ' + count + ' pages (' + subsets.size + ' cached files).')
      },
    },
  }
}
