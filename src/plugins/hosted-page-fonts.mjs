import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'parse5'
import postcss from 'postcss'
import { create } from 'fontkitten'
import fontverter from 'fontverter'
import { writeNavigationPackets } from './navigation-packets.mjs'

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20)
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const invisible = /[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Zl}\p{Zp}]/u

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

function pageText(html) {
  const characters = new Set()
  const add = text => { for (const c of text) if (!invisible.test(c)) characters.add(c) }
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
  return [...characters]
}

function advertisedRanges(css) {
  const families = new Map()
  postcss.parse(css).walkAtRules('font-face', rule => {
    const props = Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]))
    const family = props['font-family'].replaceAll(/["']/g, '')
    const ranges = families.get(family) ?? []
    for (const part of props['unicode-range'].split(',')) {
      const [a, b = a] = part.trim().replace(/^U\+/i, '').split('-')
      ranges.push([parseInt(a.replaceAll('?', '0'), 16), parseInt(b.replaceAll('?', 'f'), 16)])
    }
    families.set(family, ranges)
  })
  return (family, c) => (families.get(family) ?? []).some(([a, b]) => c.codePointAt(0) >= a && c.codePointAt(0) <= b)
}

export async function hostedFontCSS(cache = new URL('../../node_modules/.cache/onpaper-google-cn/', import.meta.url)) {
  await mkdir(cache, { recursive: true })
  const key = hash('google-cn-full-v3-native-family-names') + '.css'
  try { return await readFile(new URL(key, cache), 'utf8') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const query = new URLSearchParams({ family: 'Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700', display: 'block' })
  query.append('family', 'Noto Serif SC:wght@200..900')
  const response = await fetch('https://fonts.googleapis.cn/css2?' + query, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('Google Fonts China dynamic CSS failed: ' + response.status)
  const css = await response.text()
  if (!css.includes("'Newsreader'") || !css.includes("'Noto Serif SC'") || !css.includes('https://fonts.gstatic.cn/')) throw new Error('Invalid dynamic font CSS: both theme families must be present')
  await writeFile(new URL(key, cache), css)
  return css
}

export function hostedFontDevelopment(server) {
  server.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/fonts/hosted-dev.css') return next()
    try {
      const css = (await hostedFontCSS())
        .replaceAll("'Newsreader'", "'OnPaper Hosted Newsreader'")
        .replaceAll("'Noto Serif SC'", "'OnPaper Hosted Noto'")
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }).end(css)
    } catch (error) { next(error) }
  })
}

// Resolve the provider CSS during the build: visitors can preload the exact
// WOFF2 URLs immediately, without another render-blocking cross-origin CSS hop.
async function writeHostedPageFonts({ output, fonts, pages, logger }) {
  const cache = new URL('../../node_modules/.cache/onpaper-google-cn/', import.meta.url)
  const destination = join(output, 'fonts', 'pages')
  await Promise.all([mkdir(cache, { recursive: true }), mkdir(destination, { recursive: true })])
  const requests = new Map()
  async function request(family, text) {
    if (!text) return []
    const query = new URLSearchParams({
      family: family === 'Newsreader' ? 'Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700' : 'Noto Serif SC:wght@200..900',
      display: 'block', text,
    })
    const endpoint = 'https://fonts.googleapis.cn/css2?' + query
    const key = hash(endpoint)
    if (requests.has(key)) return requests.get(key)
    const pending = (async () => {
      let definitions
      try { definitions = JSON.parse(await readFile(new URL(key + '.json', cache), 'utf8')) }
      catch (error) {
        if (error.code !== 'ENOENT') throw error
        const response = await fetch(endpoint, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(20000) })
        if (!response.ok) throw new Error('Google Fonts China CSS failed: ' + response.status + ' (' + family + ')')
        definitions = []
        postcss.parse(await response.text()).walkAtRules('font-face', rule => {
          const props = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
          const url = props.src?.match(/url\(['"]?([^'"\)]+)/)?.[1]
          if (!url || new URL(url).origin !== 'https://fonts.gstatic.cn' || !props.src.includes('woff2')) throw new Error('Unexpected hosted font source')
          definitions.push({ url, style: props['font-style'], weight: props['font-weight'] })
        })
        const expected = family === 'Newsreader' ? 2 : 1
        if (definitions.length !== expected) throw new Error('Expected ' + expected + ' hosted text subsets for ' + family)
      }
      const result = []
      for (const definition of definitions) {
        const filename = 'google-cn-' + hash(definition.url) + '.woff2'
        let bytes
        try { bytes = await readFile(new URL(filename, cache)) }
        catch (error) {
          if (error.code !== 'ENOENT') throw error
          const response = await fetch(definition.url, { signal: AbortSignal.timeout(20000) })
          if (!response.ok) throw new Error('Google Fonts China WOFF2 failed: ' + response.status)
          bytes = Buffer.from(await response.arrayBuffer())
          await writeFile(new URL(filename, cache), bytes)
        }
        const font = create(await fontverter.convert(bytes, 'sfnt'))
        const characters = [...text].filter(c => font.hasGlyphForCodePoint(c.codePointAt(0)))
        if (!characters.length) continue
        result.push({ ...definition, characters })
      }
      await writeFile(new URL(key + '.json', cache), JSON.stringify(definitions))
      return result
    })()
    requests.set(key, pending)
    return pending
  }

  // Dynamic search text uses the provider's general unicode shards. Only their
  // declarations are deferred; every font URL remains on the hosted origin.
  const fullCSS = await hostedFontCSS(cache)
  const supports = advertisedRanges(fullCSS)
  const latinCharacters = new Set(Array.from({ length: 95 }, (_, i) => String.fromCodePoint(i + 32)))
  for (const page of pages) for (const c of page.characters) if (supports('Newsreader', c)) latinCharacters.add(c)
  const latinText = [...latinCharacters].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('')
  const dynamicHref = '/fonts/pages/dynamic-' + hash(fullCSS) + '.css'
  await writeFile(join(output, dynamicHref), fullCSS)
  const shared = await request('Newsreader', latinText)
  const latinCoverage = new Set(shared.flatMap(face => face.characters))
  const latinAlias = 'OnPaper Latin Google ' + hash(latinText)
  let index = 0
  async function worker() {
    while (index < pages.length) {
      const { path, html, characters } = pages[index++]
      const chinese = characters.filter(c => !latinCoverage.has(c) && supports('Noto Serif SC', c)).join('')
      const body = await request('Noto Serif SC', chinese)
      const bodyAlias = 'OnPaper Page Google ' + hash(chinese)
      const definitions = [...shared.map(face => ({ ...face, alias: latinAlias })), ...body.map(face => ({ ...face, alias: bodyAlias }))]
      const covered = new Set(definitions.flatMap(face => face.characters))
      const unavailable = characters.filter(c => !covered.has(c)).join('')
      const rules = definitions.map(face => '@font-face{font-family:"' + face.alias + '";src:url("' + face.url + '") format("woff2");font-style:' + face.style + ';font-weight:' + face.weight + ';font-display:block;unicode-range:' + face.characters.map(c => 'U+' + c.codePointAt(0).toString(16)).join(',') + '}')
      for (const property of ['body', 'display']) {
        rules.push(':root{--font-' + property + '-web:' + fonts[property].replaceAll('"Newsreader"', '"' + latinAlias + '","Newsreader"').replaceAll('"Noto Serif SC"', '"' + bodyAlias + '","Noto Serif SC"') + '}')
      }
      const style = '<style data-onpaper-page-fonts data-provider="google-cn" data-dynamic-css="' + dynamicHref + '" data-characters="' + escape([...covered].join('')) + '" data-unavailable="' + escape(unavailable) + '">' + rules.join('') + '</style>'
      const preloads = definitions.map(face => '<link rel="preload" as="font" type="font/woff2" crossorigin href="' + escape(face.url) + '" data-onpaper-font>').join('')
      const updated = html.replace(/(<meta[^>]+name="viewport"[^>]*>)/, '$1<link rel="preconnect" href="https://fonts.gstatic.cn" crossorigin>' + preloads)
        .replace('</head>', style + '</head>')
      await writeFile(path, updated)
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker))
  logger.info('Prepared Google Fonts China subsets for ' + pages.length + ' pages; all theme font requests use fonts.gstatic.cn.')
}

export function hostedFontIntegration(fonts) {
  return {
    name: 'onpaper-hosted-fonts',
    hooks: {
      'astro:server:setup': ({ server }) => hostedFontDevelopment(server),
      'astro:build:generated': async ({ dir, logger }) => {
        const output = fileURLToPath(dir), generated = new Set(), pages = []
        for (const entry of await readdir(join(output, '_astro'))) {
          if (!entry.endsWith('.css')) continue
          postcss.parse(await readFile(join(output, '_astro', entry), 'utf8')).walkDecls('content', declaration => {
            for (const match of declaration.value.matchAll(/(['"])(.*?)\1/g)) {
              for (const c of match[2].replace(/\\([0-9a-f]{1,6})\s?/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))) if (!invisible.test(c)) generated.add(c)
            }
          })
        }
        for await (const path of files(output)) {
          if (!path.endsWith('.html')) continue
          const html = await readFile(path, 'utf8')
          const characters = [...new Set([...pageText(html), ...generated])].sort((a, b) => a.codePointAt(0) - b.codePointAt(0))
          pages.push({ path, html, characters })
        }
        await writeHostedPageFonts({ output, fonts, pages, logger })
        await writeNavigationPackets(output, pages.map(page => page.path))
      },
    },
  }
}
