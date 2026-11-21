/**
 * The images in docs/zh/ and docs/en/, built rather than assembled by hand.
 *
 * Run it once against a Chinese build and once against an English one; each
 * writes into the folder for its language.
 *
 *   npm run build && (cd dist && python -m http.server 4300)
 *   BASE_URL=http://localhost:4300 node scripts/docs-shots.mjs   # → docs/zh/
 *
 * The three pictures the README shows are composites: a browser frame or a
 * phone body drawn around a real screenshot, laid out on a grid. This script
 * takes the screenshots, draws the chrome and lays out the grid, so a design
 * change does not mean redoing the pictures in an image editor.
 *
 * A server must be running against the current build:
 *
 *   npm run build && (cd dist && python -m http.server 4300)
 *   BASE_URL=http://localhost:4300 node scripts/docs-shots.mjs --lang=en
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import sharp from 'sharp'

const base = process.env.BASE_URL || 'http://localhost:4300'
// The pictures are in two sets: the Chinese README shows a Chinese site and
// the English README an English one. Which set this run writes into is decided
// by the language the build actually renders, a few lines below, so the two
// never overwrite each other.
let outDir = 'docs'

// The interface language, read from the built HTML rather than passed in: what
// matters is what the screenshots will actually show.
const navLabels = { zh: ['文章', '归档', '关于', '友链'], en: ['Writing', 'Archive', 'About', 'Friends'] }

const browser = await chromium.launch()

async function shot(path, { width, height, scheme = 'light', deviceScaleFactor = 2 }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor })
  const page = await context.newPage()
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // The wordmark inks itself in over ~1s on first visit; wait it out so no
  // character is caught half-covered.
  // The page waits for its fonts, then shows without them after 6 seconds.
  // Waiting out that gate is what makes the picture show the real page rather
  // than the blank sheet the gate starts with; there is no cheaper signal,
  // because the gate opens on a timer, not on an event.
  await page.waitForTimeout(9000)

  const buffer = await page.screenshot({ type: 'png' })
  const nav = await page.$$eval('.rail-nav a, .mobile-nav a', els => els.map(a => a.textContent.trim()))
  await context.close()
  const lang = nav.some(label => navLabels.zh.includes(label)) ? 'zh' : 'en'
  return { buffer, lang }
}

/** Wrap a screenshot in macOS-style window chrome. */
async function browserFrame(image, { label }) {
  const meta = await sharp(image).metadata()
  const pad = 20
  const bar = 46
  const width = meta.width + pad * 2
  const height = meta.height + bar + pad
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" rx="14" fill="#ffffff"/>
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="none" stroke="#E4E6EB"/>
    <text x="${width - pad}" y="30" text-anchor="end"
      font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="1.6" fill="#9AA0AC">${label}</text>
  </svg>`
  return sharp(Buffer.from(svg))
    .composite([{ input: image, left: pad, top: bar }])
    .png()
    .toBuffer()
}

/** Wrap a phone screenshot in a phone body. */
async function phoneFrame(image) {
  const meta = await sharp(image).metadata()
  const pad = 18
  const radius = 44
  const width = meta.width + pad * 2
  const height = meta.height + pad * 2
  const body = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" rx="${radius}" fill="#182134"/>
    <rect x="${pad}" y="${pad}" width="${meta.width}" height="${meta.height}" rx="${28}" fill="#F4F5F7"/>
  </svg>`
  const rounded = await sharp(image)
    .composite([{ input: Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect width="${meta.width}" height="${meta.height}" rx="28" fill="#fff"/></svg>`), blend: 'dest-in' }])
    .png()
    .toBuffer()
  return sharp(Buffer.from(body))
    .composite([{ input: rounded, left: pad, top: pad }])
    .png()
    .toBuffer()
}

/** A caption under a panel, in the manner of the existing pictures. */
async function captionUnder(image, text, { width, fill = '#8A8F9A' }) {
  const meta = await sharp(image).metadata()
  const height = 58
  const svg = `<svg width="${meta.width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="34" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
      font-size="17" letter-spacing="2.4" fill="${fill}">${text}</text>
  </svg>`
  return sharp({ create: { width: meta.width, height: meta.height + height, channels: 4, background: '#00000000' } })
    .composite([
      { input: image, left: 0, top: 0 },
      { input: Buffer.from(svg), left: 0, top: meta.height },
    ])
    .png()
    .toBuffer()
}

/** Place panels on a canvas at the given positions. */
async function compose({ width, height, background = '#E9EBEF', items }) {
  return sharp({ create: { width, height, channels: 4, background } })
    .composite(items)
    .png()
    .toBuffer()
}

// ── one set of screenshots ──────────────────────────────────────────────────

console.log('taking screenshots…')
const homeLight = await shot('/', { width: 1440, height: 1000 })
const homeDark = await shot('/', { width: 1440, height: 1000, scheme: 'dark' })
const articlePath = homeLight.lang === 'en' ? '/posts/leave-a-little-margin/' : '/posts/getting-started/'
const article = await shot(articlePath, { width: 1440, height: 1000, scheme: 'light' })
const shelf = await shot('/shelf/', { width: 1440, height: 1000, scheme: 'light' })
const homePhone = await shot('/', { width: 390, height: 844, scheme: 'light' })
const nowPhone = await shot('/now/', { width: 390, height: 844, scheme: 'light' })

const lang = homeLight.lang
outDir = `docs/${lang}`
await mkdir(outDir, { recursive: true })
console.log(`interface language: ${lang} → ${outDir}/`)

const L = lang === 'zh'
  ? { home: 'HOME / 首页', dark: 'HOME / 首页 · 深色', article: 'ARTICLE / 文章与目录', shelf: 'SHELF / 书单 · 片单 · 歌单', homePhone: 'HOME / 首页', nowPhone: 'NOW / 最近与这个站' }
  : { home: 'HOME / LIGHT', dark: 'HOME / DARK', article: 'ARTICLE / TEXT AND OUTLINE', shelf: 'SHELF / BOOKS · FILMS · MUSIC', homePhone: 'HOME', nowPhone: 'NOW / RECENTLY AND THIS SITE' }

// showcase.png — four panels, 2×2, on a light grey field.
const SHOW_W = 2400
const half = Math.floor(SHOW_W / 2)
const a = await browserFrame(homeLight.buffer, { label: L.home })
const b = await browserFrame(homeDark.buffer, { label: L.dark })
const c = await browserFrame(article.buffer, { label: L.article })
const d = await browserFrame(shelf.buffer, { label: L.shelf })
const scaled = await Promise.all([a, b, c, d].map(buf => sharp(buf).resize({ width: half - 24 }).png().toBuffer()))
const meta = await sharp(scaled[0]).metadata()
const gap = 36
const pad = 22
const showcase = await compose({
  width: half * 2,
  height: meta.height * 2 + gap + pad * 2,
  items: [
    { input: scaled[0], left: pad, top: pad },
    { input: scaled[1], left: half, top: pad },
    { input: scaled[2], left: pad, top: pad + meta.height + gap },
    { input: scaled[3], left: half, top: pad + meta.height + gap },
  ],
})
await writeFile(`${outDir}/showcase.png`, showcase)

// mobile.png — two phones side by side, captioned underneath.
const ph1 = await captionUnder(await phoneFrame(homePhone.buffer), L.homePhone, { width: 590 })
const ph2 = await captionUnder(await phoneFrame(nowPhone.buffer), L.nowPhone, { width: 590 })
const p1 = await sharp(ph1).metadata()
const p2 = await sharp(ph2).metadata()
const mobile = await compose({
  width: p1.width + p2.width + 56,
  height: Math.max(p1.height, p2.height) + 72,
  items: [
    { input: ph1, left: 30, top: 40 },
    { input: ph2, left: p1.width + 60, top: 40 },
  ],
})
await writeFile(`${outDir}/mobile.png`, mobile)

// details.png — the search sheet, the music card and the GitHub card, each
// cropped out of a real page rather than drawn.
console.log('taking detail crops…')
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'light', deviceScaleFactor: 2 })
const page = await context.newPage()
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1600)
await page.keyboard.press('/')
await page.waitForTimeout(600)
// "Building index…" is what the sheet says until the index arrives, and a
// picture of that is a picture of nothing. Wait for a result row, or for the
// empty-state sentence once the index is in.
await page.keyboard.type(lang === 'zh' ? '城市' : 'city', { delay: 40 })
await page.waitForFunction(() => {
  if (document.querySelector('.search-result')) return true
  const hint = document.querySelector('.search-hint')
  return Boolean(hint) && !/index|索引/i.test(hint.textContent || '')
}, { timeout: 25000 }).catch(() => {})
await page.waitForTimeout(500)
// The dialog sizes itself to its results, and with one result it is a short
// strip that cuts the row off. Give it a height for the picture, the way the
// original did, so the sheet reads as a sheet.
await page.addStyleTag({ content: '#search-dialog { min-height: 22rem; }' })
await page.waitForTimeout(300)
const searchShot = await page.locator('#search-dialog').screenshot({ type: 'png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// The English build has its own post with a music card.
await page.goto(`${base}/posts/${lang === 'en' ? 'headphones-and-the-city' : 'headphones-on'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1200)
const musicShot = await page.evaluate(() => document.fonts.ready).then(() => page.locator('.mc-card').first().screenshot({ type: 'png' }))
await page.goto(`${base}/posts/format-showcase/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(9000)
const githubCard = page.locator('.github-card').first()
const githubShot = await githubCard.screenshot({ type: 'png' })
await context.close()

const s1 = await sharp(searchShot).resize({ width: 1100 }).png().toBuffer()
const s2 = await sharp(musicShot).resize({ width: 820 }).png().toBuffer()
const s3 = await sharp(githubShot).resize({ width: 820 }).png().toBuffer()
const s1m = await sharp(s1).metadata()
const s2m = await sharp(s2).metadata()
const s3m = await sharp(s3).metadata()
const details = await compose({
  width: s1m.width + s2m.width + 90,
  height: Math.max(s1m.height, s2m.height + s3m.height + 30) + 80,
  items: [
    { input: s1, left: 30, top: 40 },
    { input: s2, left: s1m.width + 60, top: 40 },
    { input: s3, left: s1m.width + 60, top: 40 + s2m.height + 30 },
  ],
})
await writeFile(`${outDir}/details.png`, details)

await browser.close()
console.log(`wrote ${outDir}/showcase.png, ${outDir}/mobile.png, ${outDir}/details.png`)
