/**
 * Render public/og.svg to public/og.png (1200×630).
 *
 * Telegram, X, Facebook and WeChat all prefer raster images for link
 * previews; SVG is not reliably supported. Run `npm run og` after changing
 * the OG template or the site palette.
 */

import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { chromium } from 'playwright'

const WIDTH = 1200
const HEIGHT = 630
const svg = await fs.readFile('public/og.svg', 'utf8')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/node_modules/@fontsource-variable/noto-serif-sc/index.css">
  <style>
    @font-face {
      font-family: 'Newsreader';
      src: url('/fonts/newsreader-latin-normal.woff2') format('woff2');
      font-style: normal;
      font-weight: 400 700;
      font-display: block;
    }
    html, body { margin: 0; padding: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #FAF9F5; }
    svg { display: block; width: ${WIDTH}px; height: ${HEIGHT}px; }
  </style>
</head>
<body>${svg}</body>
</html>`

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
}

const fontPackage = resolve('node_modules/@fontsource-variable/noto-serif-sc')
const publicFonts = resolve('public/fonts')

function safeFile(base, relative) {
  const file = resolve(base, relative)
  if (file !== base && !file.startsWith(base + sep)) return null
  return file
}

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)

  if (pathname === '/__og.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  let file = null
  if (pathname.startsWith('/node_modules/@fontsource-variable/noto-serif-sc/')) {
    file = safeFile(fontPackage, pathname.slice('/node_modules/@fontsource-variable/noto-serif-sc/'.length))
  }
  else if (pathname.startsWith('/fonts/')) {
    file = safeFile(publicFonts, pathname.slice('/fonts/'.length))
  }

  if (!file) {
    res.writeHead(404).end('not found')
    return
  }

  try {
    const body = await fs.readFile(file)
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
    res.end(body)
  }
  catch {
    res.writeHead(404).end('not found')
  }
})

await new Promise(done => server.listen(0, '127.0.0.1', done))
const { port } = server.address()

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
page.on('pageerror', error => console.error(`[og] ${error.message}`))
await page.goto(`http://127.0.0.1:${port}/__og.html`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(200)

const fonts = await page.evaluate(() => ({
  noto: document.fonts.check('600 156px "Noto Serif SC Variable"'),
  newsreader: document.fonts.check('400 22px "Newsreader"'),
}))
if (!fonts.noto) console.warn('[og] Noto Serif SC Variable did not load; check the fontsource CSS.')
if (!fonts.newsreader) console.warn('[og] Newsreader did not load; check public/fonts.')

await page.screenshot({ path: 'public/og.png', type: 'png' })
console.log(`saved public/og.png (${WIDTH}×${HEIGHT})`)

await browser.close()
await new Promise(done => server.close(done))