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
const routes = JSON.parse((await readFile(resolve(dist, 'index.html'), 'utf8')).match(/<script type="application\/json" data-onpaper-navigation>(.*?)<\/script>/s)[1])

const errors = []
const ready = page => page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready')
const connected = { saveData: false, effectiveType: '4g' }
async function instrument(context, connection = connected) {
  await context.addInitScript(connection => {
    Object.defineProperty(navigator, 'connection', { value: connection })
    window.__fetchLog = []
    const nativeFetch = window.fetch
    window.fetch = (url, options) => {
      const parsed = new URL(typeof url === 'string' ? url : url.url, location.href)
      const entry = { path: parsed.pathname, origin: parsed.origin, priority: options?.priority, aborted: false }
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
        let started
        const background = new Promise(resolve => { started = resolve })
        await context.route('**' + routes['/tags/'], async route => { started(); await gate; await route.continue().catch(() => {}) })
        try {
          await page.goto(base + '/')
          await ready(page)
          await page.locator('.rail-nav a[href="/tags/"]').focus()
          await background
          await page.locator('.rail-nav a[href="/friends/"]').click()
          await page.waitForURL(base + '/friends/')
          await ready(page)
          const log = await page.evaluate(() => window.__fetchLog)
          assert.ok(log.some(entry => entry.path === routes['/tags/'] && entry.aborted), JSON.stringify(log))
          assert.ok(log.some(entry => entry.origin === 'https://fonts.gstatic.cn' && entry.priority === 'high'), JSON.stringify(log))
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
          await context.route('https://fonts.gstatic.cn/**', async route => {
            if (hold) await gate
            await route.continue().catch(() => {})
          })
          const firstFont = page.waitForRequest(request => new URL(request.url()).origin === 'https://fonts.gstatic.cn')
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
          assert.ok(log.some(entry => entry.origin === 'https://fonts.gstatic.cn' && entry.aborted), JSON.stringify(log))
          assert.ok(log.filter(entry => entry.origin === 'https://fonts.gstatic.cn').every(entry => entry.priority === 'high'))
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ': a newer click cancels stalled font downloads and controls stay responsive')
      }
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
        await instrument(context, { saveData: false, effectiveType: '3g' })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        let release
        const gate = new Promise(resolve => { release = resolve })
        let requests = 0
        await context.route('**' + routes['/page/2/'], async route => { requests++; await gate; await route.continue().catch(() => {}) })
        try {
          await page.goto(base + '/')
          await ready(page)
          const next = page.locator('.pagination__side--next a')
          const html = page.waitForRequest(request => new URL(request.url()).pathname === routes['/page/2/'])
          await next.hover()
          await html
          await next.click()
          await page.waitForTimeout(100)
          assert.equal(requests, 1, 'click must reuse the HTML request started on hover')
          assert.equal(await page.evaluate(path => window.__fetchLog.find(entry => entry.path === path).aborted, routes['/page/2/']), false)
          release()
          await page.waitForURL(base + '/page/2/')
          await ready(page)
          assert.equal(requests, 1)
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ': clicking next page reuses in-flight target HTML')
      }
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
        await instrument(context, { saveData: true, effectiveType: '3g' })
        await context.addInitScript(() => {
          window.__hiddenNavigationFrames = []
          document.addEventListener('astro:after-swap', () => {
            if (document.documentElement.dataset.fontState !== 'ready') window.__hiddenNavigationFrames.push(location.pathname + ': swap')
          })
          const inspect = () => {
            if (document.documentElement.hasAttribute('data-font-navigation') && getComputedStyle(document.body).opacity === '0') {
              window.__hiddenNavigationFrames.push(location.pathname + ': frame')
            }
            requestAnimationFrame(inspect)
          }
          requestAnimationFrame(inspect)
        })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        const duplicates = []
        let release
        const gate = new Promise(resolve => { release = resolve })
        try {
          await page.goto(base + '/')
          await ready(page)
          // Byte downloads may proceed. Hold any second CSS/native font request
          // indefinitely: the incoming page must already have decoded faces.
          await context.route('https://fonts.gstatic.cn/**', async route => {
            if (route.request().resourceType() === 'font') {
              duplicates.push(route.request().url())
              await gate
            }
            await route.continue().catch(() => {})
          })
          for (const target of ['/page/2/', '/', '/posts/toc-stress-test/', '/about/', '/page/2/']) {
            await page.evaluate(target => {
              const a = document.createElement('a'); a.href = target; document.body.append(a); a.click(); a.remove()
            }, target)
            await page.waitForURL(base + target)
            await ready(page)
            assert.equal(await page.evaluate(() => getComputedStyle(document.body).opacity), '1')
            if (engine === chromium) {
              const cdp = await context.newCDPSession(page)
              try {
                await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
                const { root } = await cdp.send('DOM.getDocument')
                const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#main h1' })
                const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
                assert.ok(fonts.length && fonts.every(font => font.isCustomFont), target + ': ' + JSON.stringify(fonts))
              } finally { await cdp.detach() }
            }
          }
          assert.deepEqual(duplicates, [], 'navigation must not download fonts again through CSS after fetching their bytes')
          assert.deepEqual(await page.evaluate(() => window.__hiddenNavigationFrames), [], 'pagination and article navigation must not hide the body after swapping')
          await page.goBack()
          await page.waitForURL(base + '/about/')
          await ready(page)
          assert.deepEqual(await page.evaluate(() => window.__hiddenNavigationFrames), [])
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ': pagination, articles and history have no hidden frames or duplicate CSS font downloads')
      }
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' })
        await instrument(context, { saveData: true })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        try {
          await page.goto(base + '/')
          await ready(page)
          let failures = 0
          let broken = true
          await context.route('https://fonts.gstatic.cn/**', async route => {
            if (broken) { failures++; await route.fulfill({ contentType: 'font/woff2', body: 'invalid font bytes' }) }
            else await route.continue()
          })
          await page.locator('.rail-nav a[href="/about/"]').click()
          await page.waitForTimeout(200)
          assert.ok(failures > 0)
          assert.equal(new URL(page.url()).pathname, '/')
          assert.equal(await page.evaluate(() => document.documentElement.dataset.fontState), 'ready')
          await page.locator('.rail-actions [data-theme-toggle]').click()
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
          broken = false
          await page.waitForURL(base + '/about/')
          await ready(page)
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).opacity), '1')
        } finally { await context.close() }
        console.log('PASS ' + engine.name() + ': invalid font bytes retry before swapping while the current page stays usable')
      }
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', colorScheme: 'light' })
        await instrument(context, { saveData: true })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        let release
        const gate = new Promise(resolve => { release = resolve })
        try {
          await page.goto(base + '/')
          await ready(page)
          await page.evaluate(() => {
            window.__articleReady = false; window.__articleModulesReady = false
            document.addEventListener('onpaper:content-ready', () => { window.__articleReady = true }, { once: true })
            document.addEventListener('astro:page-load', () => { window.__articleModulesReady = true }, { once: true })
          })
          await context.route('**/ArticleEnhancements*.js', async route => { await gate; await route.continue().catch(() => {}) })
          const module = page.waitForRequest(request => request.url().includes('/ArticleEnhancements') && request.url().endsWith('.js'))
          await page.evaluate(() => {
            const a = document.createElement('a'); a.href = '/posts/toc-stress-test/'; document.body.append(a); a.click(); a.remove()
          })
          await module
          await page.waitForURL(base + '/posts/toc-stress-test/')
          assert.equal(await page.evaluate(() => window.__articleReady), true, 'readable content and entrance must start before article modules finish')
          assert.equal(await page.evaluate(() => window.__articleModulesReady), false)
          assert.equal(await page.evaluate(() => document.documentElement.dataset.fontState), 'ready')
          await page.locator('.rail-actions [data-theme-toggle]').click()
          await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
        } finally { release(); await context.close() }
        console.log('PASS ' + engine.name() + ': article text, entrance and theme controls do not wait for article modules')
      }
    } finally { await browser.close() }
  }
  assert.deepEqual(errors, [])
} finally { server.close() }
