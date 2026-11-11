/** Render the OG template using the same hosted fonts as the site. */
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import { chromium } from 'playwright'
import { hostedFontCSS } from '../src/plugins/hosted-page-fonts.mjs'

const width = 1200, height = 630
const output = process.argv[2] ?? 'public/og.png'
const svg = await fs.readFile('public/og.svg', 'utf8')
const css = await hostedFontCSS()
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${css}html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:#FAF9F5}svg{display:block;width:${width}px;height:${height}px}</style>
</head><body>${svg}</body></html>`
const server = createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'load' })
  await page.evaluate(async () => {
    const faces = [...document.fonts].filter(face => ['Newsreader', 'Noto Serif SC'].includes(face.family))
    await Promise.all(faces.filter(face => face.status === 'loading').map(face => face.load()))
    await document.fonts.ready
    for (const family of ['Newsreader', 'Noto Serif SC']) {
      if (!faces.some(face => face.family === family && face.status === 'loaded')) throw new Error('OG font did not load: ' + family)
    }
  })
  await page.screenshot({ path: output, type: 'png' })
  console.log(`saved ${output} (${width}×${height})`)
} finally { await browser.close(); server.closeAllConnections(); server.close() }
