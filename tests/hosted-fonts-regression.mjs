import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium, webkit } from 'playwright'

const root = resolve('dist')
const csp = (await readFile(resolve(root, '_headers'), 'utf8')).match(/Content-Security-Policy: (.+)/)?.[1].replace(/; upgrade-insecure-requests/, '')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  try {
    let file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end()
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html')
    let bytes = await readFile(file)
    const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp }
    if (/\.(html|css|js|json|svg)$/.test(file)) { bytes = gzipSync(bytes); headers['Content-Encoding'] = 'gzip' }
    res.writeHead(200, headers).end(bytes)
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = 'http://127.0.0.1:' + server.address().port
const errors = [], results = []
const ready = page => page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready', null, { timeout: 45000 })
const clickRoute = (page, href) => page.evaluate(href => { const link = document.createElement('a'); link.href = href; document.body.append(link); link.click(); link.remove() }, href)
async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name)
    if (entry.isDirectory()) yield* files(file)
    else yield file
  }
}
try {
  let pages = 0, packets = 0
  for await (const file of files(root)) {
    if (file.endsWith('.html')) {
      const html = await readFile(file, 'utf8')
      const style = html.match(/<style\b[^>]*data-onpaper-page-fonts[^>]*>[\s\S]*?<\/style>/)?.[0]
      if (!style) continue
      assert.ok(style.includes('data-provider="google-cn"'))
      const urls = [...style.matchAll(/url\("([^"]+)"\)/g)].map(m => m[1])
      assert.ok(urls.length > 0 && urls.length <= 3)
      assert.ok(urls.every(url => new URL(url).origin === 'https://fonts.gstatic.cn'))
      assert.ok(!/data-font-fallback|data-onpaper-legacy-font/.test(html))
      assert.ok(!/U\+(?:200d|fe0[ef]|200b|2060|200e|2028|2029)(?:[,;}])/i.test(style), 'invisible shaping characters must not require separate glyphs')
      const start = html.indexOf('<!--email_off-->'), end = html.indexOf('<!--/email_off-->')
      for (const match of html.matchAll(/href="mailto:[^"]+"/g)) assert.ok(match.index > start && match.index < end, 'email links remain within Cloudflare opt-out markers')
      pages++
    }
    if (file.includes(sep + '_navigation' + sep) && file.endsWith('.json')) {
      const packet = JSON.parse(await readFile(file, 'utf8'))
      assert.ok(!('fonts' in packet), 'navigation packets must not have the old embedded-font field')
      packets++
    }
  }
  assert.ok(pages >= 20 && packets >= 20)
  console.log('PASS ' + pages + ' pages and ' + packets + ' navigation packets: hosted-only theme fonts, no embedded font bytes')

  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch()
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' })
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '3g' } })
          window.__hostedProbe = true
          window.__fontCSP = []
          document.addEventListener('securitypolicyviolation', e => { if (/font|fonts\.gstatic/.test(e.blockedURI)) window.__fontCSP.push(e.blockedURI) })
        })
        const page = await context.newPage(), requests = []
        page.on('pageerror', e => errors.push(e.message))
        page.on('request', r => { if (r.resourceType() === 'font' || r.url().startsWith('https://fonts.gstatic.cn/')) requests.push(r.url()) })
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
        await ready(page)
        assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).opacity), '1')
        assert.equal(await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded' && f.family.startsWith('OnPaper')).length), 3)
        assert.equal(await page.locator('link[href*="/fonts/pages/dynamic-"]').count(), 0, 'dynamic font CSS must not block first paint')
        const controls = width > 1100 ? '.rail-actions' : '.mobile-bar__actions'
        await page.locator(controls + ' [data-theme-toggle]').click()
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
        async function search(query) {
          await page.locator(controls + ' [data-search-trigger]').click()
          await page.locator('#search-input').fill(query)
          await page.locator('.search-result').first().waitFor({ timeout: 45000 })
          assert.equal(await page.locator('link[href*="/fonts/pages/dynamic-"]').count(), 1)
          await page.keyboard.press('Escape')
          await page.waitForFunction(() => !document.querySelector('#search-dialog').open)
        }
        await search('Markdown')
        for (const path of ['/about/', '/posts/toc-stress-test/', '/page/2/', '/']) {
          await clickRoute(page, path)
          await page.waitForURL(base + path, { timeout: 45000 })
          await ready(page)
          assert.equal(await page.evaluate(() => window.__hostedProbe), true, 'navigation must preserve the current document runtime')
          assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).opacity), '1')
        }
        await search('纸上')
        const outside = await page.evaluate(async () => {
          const el = document.createElement('span'); el.textContent = '龘';
          await window.__onpaperFonts.prepareTextFonts(el)
          return [...document.fonts].filter(f => f.family === 'Noto Serif SC' && f.status === 'loaded').length
        })
        assert.ok(outside > 0, 'dynamic Chinese must load general hosted font shards')
        if (engine === chromium) {
          const cdp = await context.newCDPSession(page)
          await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
          const { root: initialDoc } = await cdp.send('DOM.getDocument')
          const { nodeId: dateNode } = await cdp.send('DOM.querySelector', { nodeId: initialDoc.nodeId, selector: '.post-meta time' })
          const { fonts: dateFonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: dateNode })
          assert.ok(dateFonts.length && dateFonts.every(font => font.isCustomFont && /italic/i.test(font.postScriptName)), 'dates must use the actual Newsreader italic face: ' + JSON.stringify(dateFonts))
          await page.evaluate(() => { const el = document.createElement('p'); el.id = 'hosted-glyph-probe'; el.textContent = '纸上留白 ABC123'; document.querySelector('#main').append(el) })
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const { root: doc } = await cdp.send('DOM.getDocument')
          const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#hosted-glyph-probe' })
          const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
          assert.ok(fonts.length >= 2 && fonts.every(font => font.isCustomFont), JSON.stringify(fonts))
          await page.locator('#hosted-glyph-probe').evaluate(el => el.remove())
        }
        assert.ok(requests.length >= 3 && requests.every(url => new URL(url).origin === 'https://fonts.gstatic.cn'), JSON.stringify(requests))
        assert.deepEqual(await page.evaluate(() => window.__fontCSP), [])
        await page.screenshot({ path: '_analysis/google-cn-' + engine.name() + '-' + width + '.png', fullPage: false })
        results.push({ engine: engine.name(), width, fontRequests: requests.length, origins: [...new Set(requests.map(url => new URL(url).origin))] })
        await context.close()
        console.log('PASS ' + engine.name() + ' ' + width + ': hosted glyphs, search, rare Chinese, theme and four client navigations')
      }
      const context = await browser.newContext({ javaScriptEnabled: false })
      const page = await context.newPage()
      await page.goto(base + '/about/', { waitUntil: 'load', timeout: 45000 })
      assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).opacity), '1')
      assert.ok(await page.locator('a[href^="mailto:"]').first().isVisible())
      await context.close()
      console.log('PASS ' + engine.name() + ': no-JavaScript content and email link remain visible')
      {
        const context = await browser.newContext()
        await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
        let release
        const gate = new Promise(resolve => { release = resolve })
        await context.route('https://fonts.gstatic.cn/**', async route => { await gate; await route.continue().catch(() => {}) })
        const page = await context.newPage()
        const localFonts = []
        page.on('request', r => { if (r.resourceType() === 'font' && new URL(r.url()).origin !== 'https://fonts.gstatic.cn') localFonts.push(r.url()) })
        try {
          const requested = page.waitForRequest('https://fonts.gstatic.cn/**')
          await page.goto(base + '/', { waitUntil: 'commit' })
          await requested
          assert.notEqual(await page.evaluate(() => document.documentElement.dataset.fontState), 'ready')
          // WebKit may pause parsing before main while the preload is held.
          const hidden = () => !document.getElementById('main') || getComputedStyle(document.body).opacity === '0'
          assert.equal(await page.evaluate(hidden), true)
          await page.waitForTimeout(500)
          assert.equal(await page.evaluate(hidden), true, 'pending online fonts must not reveal system or local replacements')
          release()
          await ready(page)
          assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).opacity), '1')
          assert.deepEqual(localFonts, [])
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ': delayed online fonts reveal only when ready, without a local-font switch')
      }
    } finally { await browser.close() }
  }
  assert.deepEqual(errors, [])
  await mkdir('_analysis', { recursive: true })
  await writeFile('_analysis/google-cn-regression-results.json', JSON.stringify({ results, errors }, null, 2))
} finally { server.closeAllConnections(); server.close() }
