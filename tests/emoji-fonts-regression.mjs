import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, extname, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { pageFontIntegration } from '../src/plugins/page-fonts.mjs'

// Use real production HTML plus the emoji sequence that exposed the live bug.
// Run the actual integration on an isolated output, then test cold load and
// pagination in both engines. Source content and the production build are intact.
const dist = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const fixture = await mkdtemp(join(tmpdir(), 'onpaper-emoji-fonts-'))
const fixtureRoot = resolve(fixture)
let server
try {
  await mkdir(join(fixture, '_astro'))
  for (const entry of await readdir(join(dist, '_astro'))) {
    if (!entry.endsWith('.css')) continue
    const css = (await readFile(join(dist, '_astro', entry), 'utf8')).replace(/url\(\s*['"]?(\/[^'"\)\s]+)['"]?\s*\)/g,
      (_, path) => 'url("' + pathToFileURL(resolve(dist, '.' + path)).href + '")')
    await writeFile(join(fixture, '_astro', entry), css)
  }
  const emoji = '👨‍👩‍👧‍👦 ⚠️ ❤️ ☀︎ \u200b\u2060\u200e\u2028\u2029'
  for (const file of ['index.html', 'page/2/index.html']) {
    const html = (await readFile(join(dist, file), 'utf8'))
      .replace(/<style\b[^>]*data-onpaper-page-fonts[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/<link\b[^>]*data-onpaper-font[^>]*>/g, '')
      .replace('</body>', '<p data-emoji-fixture>' + emoji + '</p></body>')
    await mkdir(resolve(fixture, file, '..'), { recursive: true })
    await writeFile(join(fixture, file), html)
  }
  await pageFontIntegration({ body: 'Newsreader,"Noto Serif SC Variable",serif', display: 'Newsreader,"Noto Serif SC Variable",serif' })
    .hooks['astro:build:generated']({ dir: pathToFileURL(fixture + sep), logger: { info() {} } })
  for (const file of ['index.html', 'page/2/index.html']) {
    const html = await readFile(join(fixture, file), 'utf8')
    const manifest = html.match(/<style\b[^>]*data-onpaper-page-fonts[^>]*>[\s\S]*?<\/style>/)?.[0]
    assert.ok(manifest)
    assert.ok(!/U\+(?:FE0[EF]|200D|200B|2060|200E|2028|2029)(?:[,;}])/i.test(manifest), 'invisible selectors must not create required standalone font subsets')
    assert.ok(html.includes(emoji), 'preserve original emoji sequences and text')
  }
  const headers = await readFile(join(dist, '_headers'), 'utf8')
  const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1].replace(/; upgrade-insecure-requests/, '')
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' }
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      let path = resolve(dist, '.' + pathname)
      if (path !== dist && !path.startsWith(dist + sep)) { response.writeHead(403).end(); return }
      if (pathname === '/' || pathname === '/page/2/') path = join(fixture, pathname === '/' ? 'index.html' : 'page/2/index.html')
      else if (pathname.startsWith('/fonts/pages/')) {
        const generated = resolve(fixture, '.' + pathname)
        if (!generated.startsWith(fixtureRoot + sep)) { response.writeHead(403).end(); return }
        try { await stat(generated); path = generated } catch {}
      }
      const data = await readFile(path)
      response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', ...(csp ? { 'Content-Security-Policy': csp } : {}) })
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch()
    try {
      for (const initial of ['/', '/page/2/']) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
        try {
          await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
          const page = await context.newPage()
          const errors = []
          page.on('pageerror', error => errors.push(error.message))
          await page.goto(base + initial)
          await page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready')
          assert.equal(await page.locator('[data-emoji-fixture]').textContent(), emoji)
          const target = initial === '/' ? '/page/2/' : '/'
          await page.locator('.pagination a[href="' + target + '"]').first().click()
          await page.waitForURL(base + target)
          await page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready')
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).opacity), '1')
          assert.equal(await page.evaluate(() => [...document.fonts].some(face => face.status === 'error')), false)
          assert.deepEqual(errors, [])
        } finally { await context.close() }
      }
      console.log('PASS ' + engine.name() + ': emoji selectors never deadlock cold loads or pagination')
    } finally { await browser.close() }
  }
} finally {
  server?.close()
  // This unique mkdtemp root contains no links or shared dependency directories.
  assert.ok(fixtureRoot.startsWith(resolve(tmpdir()) + sep) && fixtureRoot.includes('onpaper-emoji-fonts-'))
  await rm(fixtureRoot, { recursive: true, force: true })
}
