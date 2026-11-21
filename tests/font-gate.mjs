/**
 * The font gate must not be able to hide the page for good.
 *
 * `html[data-font-state="loading"] body { opacity: 0 }` is what keeps a reader
 * from seeing unreplaced text while the webfonts arrive. It is a good trade
 * until the fonts never arrive: the loader gives up after six seconds, shows
 * the page in system faces, and then its own retry timer runs again. That
 * second run used to set `loading` before checking whether it had already
 * given up — so the page went back to `opacity: 0` and stayed there. A reader
 * behind a blocked or flaky font host got an article that never appeared, with
 * no error and nothing to click.
 *
 * These cases drive the real loader in a browser with the font files blocked,
 * which is the condition that produced it.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import sharp from 'sharp'

const PORT = 4357
const server = spawn('python', ['-m', 'http.server', String(PORT)], { cwd: 'dist', stdio: 'ignore' })
const stop = () => server.kill()
process.on('exit', stop)

const ready = await waitForServer(`http://127.0.0.1:${PORT}/`, 15000)
assert.ok(ready, 'the built site did not come up')

const browser = await chromium.launch()

/** How many distinct colours the page paints; 1 means a blank sheet. */
async function paintedColours(page) {
  const buffer = await page.screenshot()
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  const seen = new Set()
  for (let i = 0; i < data.length; i += info.channels) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
  return seen.size
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  // Every font request fails, the way an unreachable font host fails.
  await page.route('**/fonts/**', route => route.abort())
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // `load` never fires with a request hanging, so the gate's own timer is the
  // only clock here. Watch past the 6s give-up, and past the retry that used
  // to undo it.
  let blankAt = []
  for (let second = 2; second <= 14; second++) {
    await page.waitForTimeout(1000)
    const state = await page.evaluate(() => ({
      fontState: document.documentElement.dataset.fontState,
      bodyOpacity: getComputedStyle(document.body).opacity,
      unavailable: document.documentElement.classList.contains('fonts-unavailable'),
    }))
    if (second >= 8) {
      // Once the gate has given up the page must stay visible, whatever the
      // retry timer does afterwards.
      assert.equal(state.bodyOpacity, '1', `body hidden at ${second}s (fontState=${state.fontState})`)
    }
    if (state.unavailable && state.bodyOpacity !== '1') blankAt.push(second)
  }

  assert.deepEqual(blankAt, [], 'the page was hidden after the fonts were given up on')

  const colours = await paintedColours(page)
  assert.ok(colours > 20, `the page painted ${colours} colour(s), which is a blank sheet`)

  // And the text is reachable: the first post title has real layout.
  const title = await page.evaluate(() => {
    const node = document.querySelector('.post-title')
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return { text: node.textContent.trim().slice(0, 20), width: Math.round(rect.width), height: Math.round(rect.height) }
  })
  assert.ok(title && title.text.length > 0, 'no post title in the document')
  assert.ok(title.width > 0 && title.height > 0, 'the post title has no layout')
}
finally {
  await browser.close()
  stop()
}

console.log('font-gate: ok')

function waitForServer(url, timeout) {
  const started = Date.now()
  return new Promise(resolve => {
    const attempt = async () => {
      try {
        const response = await fetch(url)
        if (response.ok) return resolve(true)
      }
      catch {}
      if (Date.now() - started > timeout) return resolve(false)
      setTimeout(attempt, 200)
    }
    attempt()
  })
}
