import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium, webkit } from 'playwright'

// Run after the production build. Hold only a stale search result's general
// Chinese font; the destination page's own hosted subsets remain available.
const root = resolve('dist')
const csp = (await readFile(resolve(root, '_headers'), 'utf8'))
  .match(/Content-Security-Policy: (.+)/)?.[1].replace(/; upgrade-insecure-requests/, '')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
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
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = 'http://127.0.0.1:' + server.address().port
const errors = []
const ready = page => page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready', null, { timeout: 45000 })
const snapshotSearch = page => page.evaluate(() => ({
  results: document.querySelector('[data-search-results]')?.textContent,
  status: document.querySelector('[data-search-status]')?.textContent,
  open: document.querySelector('#search-dialog')?.open,
}))
async function deadline(promise, ms, message) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })]) }
  finally { clearTimeout(timer) }
}

try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch()
    try {
      for (const scenario of ['new-query', 'closed-search']) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
        await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(engine.name() + '/' + scenario + ': ' + error.message))
        let release, notifyHeld, hold = true, held = 0
        const gate = new Promise(resolve => { release = resolve })
        const requested = new Promise(resolve => { notifyHeld = resolve })
        try {
          await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
          await ready(page)
          await page.evaluate(() => {
            window.__searchFontIsolation = { rareStarted: 0, rareFinished: 0 }
            const prepare = window.__onpaperFonts.prepareTextFonts
            window.__onpaperFonts.prepareTextFonts = async content => {
              const rare = content.textContent.includes('龘')
              if (rare) window.__searchFontIsolation.rareStarted++
              try { await prepare(content) }
              finally { if (rare) window.__searchFontIsolation.rareFinished++ }
            }
          })
          await context.route('**/search.json', route => route.fulfill({ json: [
            { title: '龘', description: 'rare-pending-token', content: 'rare-pending-token', tags: [], date: '2026-01-01', url: '/about/' },
            { title: 'ABC', description: 'available-token', content: 'available-token', tags: [], date: '2026-01-01', url: '/about/' },
          ] }))
          await context.route('https://fonts.gstatic.cn/**', async route => {
            if (hold && route.request().resourceType() === 'font' && new URL(route.request().url()).pathname.includes('/notoserifsc/')) {
              held++
              notifyHeld()
              await gate
            }
            await route.continue().catch(() => {})
          })
          await page.locator('.rail-actions [data-search-trigger]').click()
          await page.locator('#search-input').fill('rare-pending-token')
          await deadline(requested, 10000, 'rare search did not request a general Chinese font')
          assert.ok(held > 0)
          assert.equal(await page.locator('.search-result').count(), 0, 'the rare result waits for its own font')
          hold = false

          if (scenario === 'new-query') {
            await page.locator('#search-input').fill('available-token')
            await page.locator('.search-result__title').filter({ hasText: /^ABC$/ }).waitFor({ timeout: 10000 })
            assert.ok(held > 0, 'a newer query must finish before the stale font is released')
          }

          await page.keyboard.press('Escape')
          await page.waitForFunction(() => !document.querySelector('#search-dialog').open)
          await page.evaluate(() => {
            const link = document.createElement('a')
            link.href = '/about/'
            document.body.append(link)
            link.click()
            link.remove()
          })
          await page.waitForURL(base + '/about/', { timeout: 15000 })
          await ready(page)
          assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).opacity), '1')
          const beforeRelease = await snapshotSearch(page)
          assert.equal(beforeRelease.open, false)
          assert.equal(await page.locator('.search-result').count(), 0)

          release()
          await page.waitForFunction(() => window.__searchFontIsolation.rareFinished > 0, null, { timeout: 45000 })
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          assert.deepEqual(await snapshotSearch(page), beforeRelease, 'a stale search completion must not populate or alter the new page dialog')
          assert.equal(new URL(page.url()).pathname, '/about/')
          assert.equal(await page.evaluate(() => document.documentElement.dataset.fontState), 'ready')
          console.log('PASS ' + engine.name() + ' ' + scenario + ': a stale search font cannot block newer work or alter the destination page')
        } finally { release(); await context.close() }
      }
    } finally { await browser.close() }
  }
  assert.deepEqual(errors, [])
} finally { server.closeAllConnections(); server.close() }
