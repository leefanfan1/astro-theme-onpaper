/**
 * Per-article social images, rendered at build time.
 *
 * Each article gets a 1200×630 PNG laid out like the site itself: the site
 * name standing on a spine at the left, then the date, the title and the
 * opening of the summary. Text is drawn with the site's own faces from
 * Google Fonts China (fonts.googleapis.cn / fonts.gstatic.cn), requested as
 * subsets of exactly the characters the images use, through the same
 * validated fetch as the page fonts, then converted from WOFF2 to TrueType
 * for satori. Subsets are cached under node_modules/.cache, so a rebuild
 * with unchanged text makes no requests.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import fontverter from 'fontverter'
import satori from 'satori'
import { fetchHostedBytes, parseHostedCSS } from './hosted-font-source.mjs'

const WIDTH = 1200
const HEIGHT = 630
// Resolved from the project root: this module is bundled into the build
// output, so a path relative to import.meta.url would land inside dist/.
const CACHE = new URL('node_modules/.cache/onpaper-og/', pathToFileURL(process.cwd() + '/'))
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// The roles match the site: Chinese display text in Noto Serif SC, running
// text in Noto Sans SC, dates and the address in Newsreader.
const FACES = [
  { name: 'OG Serif', family: 'Noto Serif SC', weight: 800, query: 'Noto Serif SC:wght@800' },
  { name: 'OG Sans', family: 'Noto Sans SC', weight: 400, query: 'Noto Sans SC:wght@400' },
  { name: 'OG Latin', family: 'Newsreader', weight: 500, query: 'Newsreader:opsz,wght@72,500' },
]

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20)

async function subset(face, text) {
  const chars = [...new Set(text)].sort().join('')
  const file = new URL(hash(`${face.query}\n${chars}`) + '.ttf', CACHE)
  try { return await readFile(file) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const query = new URLSearchParams({ family: face.query, text: chars })
  const css = await fetchHostedBytes('https://fonts.googleapis.cn/css2?' + query, 'css', { 'User-Agent': ua })
  const definitions = parseHostedCSS(css.toString('utf8'), face.family)
  // A text subset is a single face; anything else is not what was asked for.
  if (definitions.length !== 1) throw new Error(`Unexpected OG font response for ${face.family}`)
  const woff2 = await fetchHostedBytes(definitions[0].url, 'font', { 'User-Agent': ua })
  const ttf = await fontverter.convert(woff2, 'truetype')
  await mkdir(CACHE, { recursive: true })
  await writeFile(file, ttf)
  return ttf
}

let loaded
/** Load the three faces once per build, subset to every character in `text`. */
function fonts(text) {
  loaded ??= Promise.all(FACES.map(async face => ({
    name: face.name,
    weight: face.weight,
    style: 'normal',
    data: await subset(face, text + '…'),
  })))
  return loaded
}

const el = (type, style, children) => ({ type, props: { style, children } })

function titleSize(title) {
  const length = [...title].length
  if (length <= 12) return 68
  if (length <= 22) return 60
  if (length <= 34) return 52
  return 46
}

/**
 * @param {object} card
 * @param {string} card.title
 * @param {string} card.summary  already cut to length
 * @param {string} card.date
 * @param {string} card.site     the site name, set on the spine
 * @param {string} card.host     the site address, shown at the foot
 * @param {object} card.colors   paper, spine, ink, soft, faint, accent
 * @param {string} allText       every character any card in this build uses
 */
export async function renderOgImage(card, allText) {
  const { colors } = card
  const spine = el('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 220,
    paddingTop: 84,
    backgroundColor: colors.spine,
  }, [...card.site].map(char => el('div', {
    fontFamily: 'OG Serif',
    fontSize: 72,
    lineHeight: 1.2,
    color: colors.ink,
  }, char)))

  const body = el('div', {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    flex: 1,
    padding: '84px 96px 72px 84px',
  }, [
    el('div', {
      fontFamily: 'OG Latin',
      fontSize: 28,
      color: colors.faint,
      letterSpacing: 1,
    }, card.date),
    el('div', {
      display: 'block',
      marginTop: 28,
      fontFamily: 'OG Serif',
      fontSize: titleSize(card.title),
      lineHeight: 1.28,
      color: colors.ink,
      lineClamp: 3,
    }, card.title),
    el('div', { width: 64, height: 4, marginTop: 36, backgroundColor: colors.accent }, []),
    card.summary
      ? el('div', {
          display: 'block',
          marginTop: 32,
          fontFamily: 'OG Sans',
          fontSize: 28,
          lineHeight: 1.65,
          color: colors.soft,
          lineClamp: 2,
        }, card.summary)
      : el('div', {}, []),
    // Pinned to the foot of the card, whatever the title and summary take.
    el('div', {
      display: 'flex',
      position: 'absolute',
      left: 84,
      right: 96,
      bottom: 64,
      paddingTop: 20,
      borderTop: `2px solid ${colors.line}`,
      fontFamily: 'OG Latin',
      fontSize: 26,
      color: colors.faint,
    }, card.host),
  ])

  // The columns are stretched by the row rather than given height: 100%,
  // which satori adds to the padding instead of including it.
  const svg = await satori(
    el('div', {
      display: 'flex',
      width: '100%',
      height: '100%',
      backgroundColor: colors.paper,
    }, [spine, body]),
    { width: WIDTH, height: HEIGHT, fonts: await fonts(allText) },
  )
  return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng()
}

export const OG_SIZE = { width: WIDTH, height: HEIGHT }
