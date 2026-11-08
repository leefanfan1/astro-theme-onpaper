import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,stat,mkdir} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium,webkit} from 'playwright'
// Run after npm run build. Serve production HTML and CSP on local HTTP.
// WebKit upgrades loopback resources too, so omit only the HTTPS-upgrade
// directive on this HTTP fixture; deployed production headers stay untouched.
const dist = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
await mkdir(new URL('../_analysis/', import.meta.url), { recursive: true })
const headers = await readFile(resolve(dist, '_headers'), 'utf8')
const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1].replace(/; upgrade-insecure-requests/, '')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let path = resolve(dist, '.' + pathname)
    if (path !== dist && !path.startsWith(dist + sep)) { response.writeHead(403).end(); return }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html')
    const data = await readFile(path)
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', ...(csp ? { 'Content-Security-Policy': csp } : {}) })
    response.end(data)
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = 'http://127.0.0.1:' + server.address().port

const errors = []
const ready = page => page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready')
const connected = { saveData: false, effectiveType: '4g' }
async function instrument(context, connection = connected) {
  await context.addInitScript(connection => {
    Object.defineProperty(navigator, 'connection', { value: connection })
    window.__fetchLog = []
    const nativeFetch = window.fetch
    window.fetch = (url, options) => {
      const entry = { path: new URL(typeof url === 'string' ? url : url.url, location.href).pathname, priority: options?.priority, aborted: false }
      window.__fetchLog.push(entry)
      options?.signal?.addEventListener('abort', () => { entry.aborted = true }, { once: true })
      return nativeFetch(url, options)
    }
  }, connection)
}
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch()
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' })
        await instrument(context, { saveData: true, effectiveType: '3g' })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        let release
        const gate = new Promise(resolve => { release = resolve })
        await context.route('**/*.js', async route => { await gate; await route.continue().catch(() => {}) })
        try {
          await page.goto(base + '/posts/toc-stress-test/', { waitUntil: 'commit' })
          await ready(page)
          assert.equal(await page.evaluate(() => document.readyState === 'complete'), false)
          const host = width > 1100 ? '.rail-actions' : '.mobile-bar__actions'
          await page.locator(host + ' [data-theme-toggle]').click()
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
          await page.locator(host + ' [data-search-trigger]').click()
          assert.equal(await page.locator('#search-dialog').evaluate(dialog => dialog.open), true)
          await page.locator('#search-input').fill('Markdown')
          await page.locator('.search-result').first().waitFor()
          await page.keyboard.press('Escape')
          await page.waitForFunction(() => !document.querySelector('#search-dialog').open)
          await page.evaluate(() => scrollTo({ top: 1500, behavior: 'instant' }))
          await page.locator('[data-back-to-top].is-visible').waitFor()
          await page.locator('[data-back-to-top]').click()
          await page.waitForFunction(() => scrollY < 1)
          if (width > 1100) {
            await page.waitForFunction(() => !document.querySelector('.toc-desktop__title').disabled)
            await page.locator('.toc-desktop__title').click()
            assert.equal(await page.locator('.toc-desktop__title').getAttribute('aria-expanded'), 'true')
          } else {
            await page.locator('.toc--mobile summary').click()
            assert.equal(await page.locator('.toc--mobile').evaluate(toc => toc.open), true)
          }
          assert.equal(await page.evaluate(() => document.readyState === 'complete'), false)
          release()
          await page.waitForLoadState('domcontentloaded')
          if (width > 1100) assert.equal(await page.locator('.toc-desktop__title').getAttribute('aria-expanded'), 'true', 'late module readiness must preserve the expanded TOC')
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ' ' + width + ': theme, search, TOC and TOP work before external modules arrive')
      }
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
        await instrument(context)
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        let release
        const gate = new Promise(resolve => { release = resolve })
        await context.route('**/tags/', async route => { await gate; await route.continue().catch(() => {}) })
        try {
          await page.goto(base + '/')
          await ready(page)
          const background = page.waitForRequest(request => new URL(request.url()).pathname === '/tags/')
          await page.evaluate(() => document.dispatchEvent(new Event('onpaper:content-ready')))
          await background
          assert.equal(await page.evaluate(() => window.__fetchLog.some(entry => entry.path.endsWith('.woff2'))), false, 'idle prefetch must not download other pages fonts')
          await page.locator('.rail-nav a[href="/friends/"]').click()
          await page.waitForURL(base + '/friends/')
          await ready(page)
          const log = await page.evaluate(() => window.__fetchLog)
          assert.ok(log.some(entry => entry.path === '/tags/' && entry.aborted), JSON.stringify(log))
          assert.ok(log.filter(entry => entry.path.endsWith('.woff2')).every(entry => entry.priority === 'high'), JSON.stringify(log))
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ': foreground navigation cancels speculative HTML and owns font bandwidth')
      }
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' })
        await instrument(context, { saveData: true, effectiveType: '3g' })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        let release, hold = true
        const gate = new Promise(resolve => { release = resolve })
        try {
          await page.goto(base + '/')
          await ready(page)
          await page.evaluate(() => { window.__navigationProbe = true })
          await context.route('**/fonts/pages/*.woff2', async route => {
            if (hold) await gate
            await route.continue().catch(() => {})
          })
          const firstFont = page.waitForRequest(request => new URL(request.url()).pathname.startsWith('/fonts/pages/'))
          await page.locator('.rail-nav a[href="/about/"]').click()
          await firstFont
          assert.equal(new URL(page.url()).pathname, '/')
          assert.equal(await page.evaluate(() => document.documentElement.dataset.fontState), 'ready')
          await page.locator('.rail-actions [data-theme-toggle]').click()
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
          hold = false
          await page.locator('.rail-nav a[href="/friends/"]').click()
          await page.waitForURL(base + '/friends/')
          await ready(page)
          assert.equal(await page.evaluate(() => window.__navigationProbe), true)
          const log = await page.evaluate(() => window.__fetchLog)
          assert.ok(log.some(entry => entry.path.endsWith('.woff2') && entry.aborted), JSON.stringify(log))
          assert.ok(log.filter(entry => entry.path.endsWith('.woff2')).every(entry => entry.priority === 'high'))
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ': a newer click cancels stalled font downloads and controls stay responsive')
      }
    } finally { await browser.close() }
  }
  assert.deepEqual(errors, [])
} finally { server.close() }
