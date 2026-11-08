import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat, mkdir, readdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'

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
const browsers = []
const options = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' }
const ready = page => page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready')
const state = page => page.evaluate(() => ({
  web: document.documentElement.dataset.fontState === 'ready',
  retry: Boolean(document.getElementById('font-load-retry')),
  family: getComputedStyle(document.body).fontFamily,
  visibility: getComputedStyle(document.body).visibility,
  opacity: getComputedStyle(document.body).opacity,
  overflow: document.documentElement.scrollWidth > innerWidth + 1,
}))
async function newPage(browser, extra = {}) {
  const context = await browser.newContext({ ...options, ...extra })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  // Keep idle prefetch from loading the glyph chosen for a later test page.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } })
    window.__fontPaintViolations = []
    const inspect = () => {
      if (document.body && document.documentElement.dataset.fontState === 'loading'
        && getComputedStyle(document.body).opacity !== '0') window.__fontPaintViolations.push(location.pathname)
      requestAnimationFrame(inspect)
    }
    requestAnimationFrame(inspect)
  })
  return { context, page }
}
async function platformFonts(page, selector) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument')
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    return (await session.send('CSS.getPlatformFontsForNode', { nodeId })).fonts
  } finally { await session.detach() }
}
async function navigate(page, path) {
  await page.evaluate(path => {
    window.__fontNavigationDone = false
    document.addEventListener('astro:page-load', () => { window.__fontNavigationDone = true }, { once: true })
    const link = document.createElement('a')
    link.href = path
    document.body.append(link)
    link.click()
    link.remove()
  }, path)
  await page.waitForURL(base + path, { timeout: 5000 })
  await page.waitForFunction(() => window.__fontNavigationDone, null, { timeout: 5000 })
}
function assertReadable(actual) {
  assert.equal(actual.visibility, 'visible')
  assert.equal(actual.opacity, '1')
  assert.equal(actual.retry, false)
  assert.equal(actual.overflow, false)
}
async function assertWaiting(page) {
  const actual = await state(page)
  assert.equal(actual.opacity, '0')
  assert.equal(actual.retry, false)
  assert.equal(actual.web, false)
  assert.equal(actual.family.includes('Newsreader'), true)
}
async function assertNoFallbackPaint(page) {
  assert.deepEqual(await page.evaluate(() => window.__fontPaintViolations), [])
}
async function failedFont(page) {
  await page.waitForFunction(() => [...document.fonts].some(face => face.status === 'error'))
}
try {
  for (const file of ['index.html', 'about/index.html']) {
    const html = await readFile(resolve(dist, file), 'utf8')
    const start = html.indexOf('<!--email_off-->')
    const end = html.indexOf('<!--/email_off-->')
    assert.ok(start >= 0 && end > start, file + ': email opt-out markers missing')
    for (const match of html.matchAll(/href="mailto:[^"]+"/g)) assert.ok(match.index > start && match.index < end)
    assert.ok(!html.includes('/cdn-cgi/l/email-protection'))
    assert.ok(!html.includes('font-load-retry'))
  }
  for (const file of await readdir(resolve(dist, '_astro'))) {
    if (!file.endsWith('.css')) continue
    const css = await readFile(resolve(dist, '_astro', file), 'utf8')
    assert.ok(!/font-display:\s*optional/.test(css), file + ': optional font-display would retain fallback text')
  }
  console.log('PASS: built fonts never use optional display')
  console.log('PASS: email links remain in Cloudflare opt-out markers; no font error/retry UI in HTML')

  for (const engine of (process.argv.includes('--webkit-only') ? [webkit] : [chromium, webkit])) {
    const name = engine.name()
    const browser = await engine.launch({ headless: true })
    browsers.push(browser)
    {
      const { context, page } = await newPage(browser)
      await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
      await ready(page)
      assertReadable(await state(page))
      if (name === 'chromium') {
        for (const selector of ['.mobile-bar .rail-wordmark__cn', '.post-title a']) {
          const fonts = await platformFonts(page, selector)
          assert.ok(fonts.length && fonts.every(font => font.isCustomFont), selector + ': ' + JSON.stringify(fonts))
        }
      }
      const range = await page.evaluate(() => [...document.fonts].filter(face => face.family.includes('Noto') && face.status === 'unloaded').map(face => face.unicodeRange).find(range => /U\+[4-9][0-9A-F]{3}/i.test(range)))
      assert.ok(range)
      const code = parseInt(range.match(/U\+([4-9][0-9A-F]{3})/i)[1], 16)
      await context.route('**/about/', async route => {
        const response = await route.fetch()
        await route.fulfill({ response, body: (await response.text()).replace('</body>', '<span hidden data-font-probe>' + String.fromCodePoint(code) + '</span></body>') })
      })
      let release
      const gate = new Promise(resolve => { release = resolve })
      await context.route('**/*.woff2', async route => { await gate; await route.continue() })
      try {
        await page.evaluate(() => { window.__fontNavigationProbe = true })
        const navigation = navigate(page, '/about/')
        await page.waitForTimeout(250)
        assert.equal(new URL(page.url()).pathname, '/')
        assertReadable(await state(page))
        assert.equal(await page.evaluate(() => window.__fontNavigationProbe), true)
        release()
        await navigation
        await ready(page)
        assert.ok(await page.locator('.prose a[href^="mailto:"]').isVisible())
        const details = await page.evaluate(range => ({
          probe: document.querySelector('[data-font-probe]')?.textContent,
          fonts: [...document.fonts].filter(face => face.unicodeRange === range).map(face => ({ family: face.family, status: face.status, style: face.style })),
        }), range)
        assert.equal(details.probe, String.fromCodePoint(code))
        // CSS-connected failed faces remain registered after a successful retry.
        assert.equal(details.fonts.some(face => face.status === 'loaded'), true, JSON.stringify(details))
      } finally { release() }
      await navigate(page, '/posts/toc-stress-test/')
      await ready(page)
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
      assertReadable(await state(page))
      assert.equal(await page.evaluate(() => document.querySelector('h1').getBoundingClientRect().top >= document.querySelector('[data-mobile-bar]').getBoundingClientRect().bottom - 1), true)
      if (name === 'chromium') await page.screenshot({ path: '_analysis/font-email-mobile-ready.png' })
      await assertNoFallbackPaint(page)
      await context.close()
      console.log('PASS ' + name + ': navigation prepares glyphs before swapping; first visible page uses site fonts; header spacing stays correct')
    }
    {
      const { context, page } = await newPage(browser)
      await page.clock.install()
      let release
      const gate = new Promise(resolve => { release = resolve })
      await context.route('**/*noto-serif*.woff2*', async route => { await gate; await route.continue() })
      try {
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
        await assertWaiting(page)
        await page.clock.fastForward(20000)
        await assertWaiting(page)
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').content), 'none')
        release()
        await ready(page)
        assertReadable(await state(page))
        await assertNoFallbackPaint(page)
        if (name === 'chromium') {
          const fonts = await platformFonts(page, '.mobile-bar .rail-wordmark__cn')
          assert.ok(fonts.length && fonts.every(font => font.isCustomFont), JSON.stringify(fonts))
        }
      } finally { release(); await context.close() }
      console.log('PASS ' + name + ': stalled fonts never expose fallback text; first reveal waits for fonts even after 20 seconds')
    }
    for (const recovery of ['timer', 'navigation', 'online']) {
      const { context, page } = await newPage(browser)
      let aborted = 0
      if (recovery === 'online') await page.addInitScript(() => {
        window.__fontTestOnline = false
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.__fontTestOnline })
      })
      await context.route('**/*noto-serif*.woff2*', route => { aborted++; return route.abort() })
      await page.goto(base + '/about/', { waitUntil: 'domcontentloaded' })
      await failedFont(page)
      await assertWaiting(page)
      assert.ok(aborted > 0)
      await page.evaluate(() => { window.__fontRecoveryProbe = true })
      await context.unroute('**/*noto-serif*.woff2*')
      if (recovery === 'navigation') await navigate(page, '/friends/')
      if (recovery === 'online') await page.evaluate(() => { window.__fontTestOnline = true; dispatchEvent(new Event('online')) })
      await ready(page)
      assert.equal(await page.evaluate(() => window.__fontRecoveryProbe), true, 'font recovery must not reload the page')
      assertReadable(await state(page))
      if (name === 'chromium') {
        const fonts = await platformFonts(page, '.mobile-bar .rail-wordmark__cn')
        assert.ok(fonts.length && fonts.every(font => font.isCustomFont), JSON.stringify(fonts))
      }
      await assertNoFallbackPaint(page)
      await context.close()
      console.log('PASS ' + name + ': partial failure recovers through ' + recovery + ' without a reload or error UI')
    }
    {
      const { context, page } = await newPage(browser)
      await page.clock.install()
      await page.addInitScript(() => {
        window.__fontPending = 0
        window.__fontFailures = 0
        const load = FontFace.prototype.load
        FontFace.prototype.load = function () {
          window.__fontPending++
          return load.call(this).then(face => {
            window.__fontPending--
            return face
          }, error => {
            window.__fontPending--
            window.__fontFailures++
            throw error
          })
        }
      })
      await context.route('**/*noto-serif*.woff2*', route => route.abort())
      await page.goto(base + '/about/', { waitUntil: 'domcontentloaded' })
      for (let attempt = 0; attempt < 5; attempt++) {
        await page.waitForFunction(() => window.__fontFailures > 0 && window.__fontPending === 0)
        const failures = await page.evaluate(() => window.__fontFailures)
        await page.clock.fastForward(35000)
        await page.waitForFunction(before => window.__fontFailures > before, failures)
        await assertWaiting(page)
      }
      await page.waitForFunction(() => window.__fontPending === 0)
      await context.unroute('**/*noto-serif*.woff2*')
      await page.clock.fastForward(35000)
      await ready(page)
      assertReadable(await state(page))
      await assertNoFallbackPaint(page)
      await context.close()
      console.log('PASS ' + name + ': repeated failures continue retrying beyond the old limit and recover automatically')
    }
    for (const scripts of ['disabled', 'blocked']) {
      const { context, page } = await newPage(browser, { javaScriptEnabled: scripts !== 'disabled' })
      if (scripts === 'blocked') await context.route('**/*.js', route => route.abort())
      await page.goto(base + '/about/', { waitUntil: 'domcontentloaded' })
      if (scripts === 'blocked') { await ready(page); await assertNoFallbackPaint(page) }
      else await page.evaluate(() => document.fonts.ready)
      assertReadable(await state(page))
      assert.ok(await page.locator('.prose a[href^="mailto:"]').isVisible())
      assert.ok((await page.locator('.prose a[href^="mailto:"]').textContent()).includes('@'))
      await context.close()
      console.log('PASS ' + name + ': scripts ' + scripts + ' retain site fonts and working email links; inline loader survives blocked modules')
    }
    await browser.close()
  }
  assert.deepEqual(errors, [])
  console.log('PASS: no page runtime errors')
} finally {
  await Promise.all(browsers.map(browser => browser.close()))
  await new Promise(resolve => server.close(resolve))
}
