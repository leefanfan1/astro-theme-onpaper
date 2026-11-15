import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { create } from 'fontkitten'
import fontverter from 'fontverter'
import { writeNavigationPackets } from './navigation-packets.mjs'
import { fetchHostedBytes, parseHostedCSS, serializeHostedCSS, validateDefinitions } from './hosted-font-source.mjs'
import { analyzeFontText } from './font-text.mjs'

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20)
// Alias words must not start with a digit: WebKit then serializes the family
// name with quotes, and every word after the prefix is a hex hash.
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
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

// Three roles, three families. Latin display text and figures use Newsreader;
// Chinese display text uses Noto Serif SC at heavy weights; all running text,
// UI and dynamic text use Noto Sans SC, which carries its own Latin.
const FAMILY_QUERY = {
  'Newsreader': 'Newsreader:opsz,wght@6..72,400..700',
  'Noto Serif SC': 'Noto Serif SC:wght@500..900',
  'Noto Sans SC': 'Noto Sans SC:wght@400..700',
}
const complete = definitions => Object.keys(FAMILY_QUERY).every(family => definitions.some(face => face.family === family)) && definitions.every(face => face.range)

export async function hostedFontCSS(cache = new URL('../../node_modules/.cache/onpaper-google-cn/', import.meta.url)) {
  await mkdir(cache, { recursive: true })
  const key = hash('google-cn-full-v4-display-body-families') + '.css'
  try {
    const definitions = parseHostedCSS(await readFile(new URL(key, cache), 'utf8'))
    if (!complete(definitions)) throw new Error('Incomplete cached font CSS')
    return serializeHostedCSS(definitions)
  }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const query = new URLSearchParams({ display: 'block' })
  for (const family of Object.values(FAMILY_QUERY)) query.append('family', family)
  const bytes = await fetchHostedBytes('https://fonts.googleapis.cn/css2?' + query, 'css', { 'User-Agent': ua })
  const definitions = parseHostedCSS(bytes.toString('utf8'))
  if (!complete(definitions)) throw new Error('Incomplete hosted font CSS')
  const css = serializeHostedCSS(definitions)
  await writeFile(new URL(key, cache), css)
  return css
}

// Runtime text (search results) is set in the body family. Leaving the serif
// shards out of the deferred sheet keeps them from ever being requested for
// running text that merely shares a page with display headings.
function dynamicFontCSS(css) {
  return serializeHostedCSS(parseHostedCSS(css).filter(face => face.family !== 'Noto Serif SC'))
}

export function hostedFontDevelopment(server) {
  server.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/fonts/hosted-dev.css') return next()
    try {
      const css = (await hostedFontCSS())
        .replaceAll('"Newsreader"', '"OnPaper Hosted Newsreader"')
        .replaceAll('"Noto Serif SC"', '"OnPaper Hosted Serif"')
        .replaceAll('"Noto Sans SC"', '"OnPaper Hosted Sans"')
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
  async function request(family, text, style = 'normal') {
    if (!text) return []
    if (style !== 'normal') throw new Error('Only upright hosted faces are configured')
    const query = new URLSearchParams({ family: FAMILY_QUERY[family], display: 'block', text })
    const endpoint = 'https://fonts.googleapis.cn/css2?' + query
    const key = hash(endpoint)
    if (requests.has(key)) return requests.get(key)
    const pending = (async () => {
      let definitions
      try { definitions = JSON.parse(await readFile(new URL(key + '.json', cache), 'utf8')) }
      catch (error) {
        if (error.code !== 'ENOENT') throw error
        definitions = parseHostedCSS((await fetchHostedBytes(endpoint, 'css', { 'User-Agent': ua })).toString('utf8'), family)
      }
      definitions = validateDefinitions(definitions, family)
      if (definitions.length !== 1 || definitions[0].style !== style) throw new Error('Unexpected hosted font style set for ' + family)
      const result = []
      for (const definition of definitions) {
        const filename = 'google-cn-' + hash(definition.url) + '.woff2'
        let bytes
        try { bytes = await readFile(new URL(filename, cache)) }
        catch (error) {
          if (error.code !== 'ENOENT') throw error
          bytes = await fetchHostedBytes(definition.url, 'font')
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
  const dynamicCSS = dynamicFontCSS(fullCSS)
  const dynamicHref = '/fonts/pages/dynamic-' + hash(dynamicCSS) + '.css'
  await writeFile(join(output, dynamicHref), dynamicCSS)
  const ascii = Array.from({ length: 95 }, (_, i) => String.fromCodePoint(i + 32))
  const shared = await request('Newsreader', latinText)
  const latinCoverage = new Set(shared.flatMap(face => face.characters))
  const latinAlias = 'OnPaper Latin Google h' + hash(latinText)
  let index = 0
  async function worker() {
    while (index < pages.length) {
      const { path, html, characters, displayCharacters } = pages[index++]
      // Running text: every page character plus printable ASCII, so typed
      // search queries never fall back to a local face.
      const bodyText = [...new Set([...ascii, ...characters])].filter(c => supports('Noto Sans SC', c))
        .sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('')
      const body = await request('Noto Sans SC', bodyText)
      // Display text: only characters the CSS sets in the display face. An
      // unrecognized display rule conservatively falls back to the full page.
      const displayText = (displayCharacters ?? characters).filter(c => !latinCoverage.has(c) && supports('Noto Serif SC', c)).join('')
      const display = await request('Noto Serif SC', displayText)
      const bodyAlias = 'OnPaper Text Google h' + hash(bodyText)
      const displayAlias = 'OnPaper Display Google h' + hash(displayText)
      const definitions = [...shared.map(face => ({ ...face, alias: latinAlias })), ...display.map(face => ({ ...face, alias: displayAlias })), ...body.map(face => ({ ...face, alias: bodyAlias }))]
      const covered = new Set(definitions.flatMap(face => face.characters))
      const unavailable = characters.filter(c => !covered.has(c)).join('')
      const rules = definitions.map(face => '@font-face{font-family:"' + face.alias + '";src:url("' + face.url + '") format("woff2");font-style:' + face.style + ';font-weight:' + face.weight + ';font-display:block;unicode-range:' + face.characters.map(c => 'U+' + c.codePointAt(0).toString(16)).join(',') + '}')
      for (const property of ['body', 'display']) {
        rules.push(':root{--font-' + property + '-web:' + fonts[property].replaceAll('"Newsreader"', '"' + latinAlias + '","Newsreader"').replaceAll('"Noto Serif SC"', '"' + displayAlias + '","Noto Serif SC"').replaceAll('"Noto Sans SC"', '"' + bodyAlias + '","Noto Sans SC"') + '}')
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
        const output = fileURLToPath(dir), cssSources = new Map(), pages = []
        for (const entry of await readdir(join(output, '_astro'))) {
          if (!entry.endsWith('.css')) continue
          cssSources.set('/_astro/' + entry, await readFile(join(output, '_astro', entry), 'utf8'))
        }
        for await (const path of files(output)) {
          if (!path.endsWith('.html')) continue
          const html = await readFile(path, 'utf8')
          pages.push({ path, html, ...analyzeFontText(html, cssSources) })
        }
        await writeHostedPageFonts({ output, fonts, pages, logger })
        await writeNavigationPackets(output, pages.map(page => page.path))
      },
    },
  }
}
