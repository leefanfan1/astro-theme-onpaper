/**
 * Visual smoke test for the demo site.
 *
 *   npm run dev
 *   npm run shots
 *
 * Screenshots land in ./screenshots (gitignored). Override the server with
 * BASE_URL=http://127.0.0.1:4322 npm run shots
 */

import fs from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.env.BASE_URL || 'http://127.0.0.1:4321'
const outDir = 'screenshots'

const cases = [
  { name: 'home-light', path: '/', width: 1440, height: 1000, scheme: 'light' },
  { name: 'home-dark', path: '/', width: 1440, height: 1000, scheme: 'dark' },
  { name: 'home-mobile', path: '/', width: 390, height: 844, scheme: 'light' },
  { name: 'post-music', path: '/posts/headphones-on/', width: 1440, height: 1000, scheme: 'light' },
  { name: 'post-extensions', path: '/posts/format-showcase/', width: 1440, height: 1000, scheme: 'dark' },
  { name: 'post-mobile', path: '/posts/a-little-margin/', width: 390, height: 844, scheme: 'light' },
  { name: 'post-long-title', path: '/posts/format-showcase/', width: 1440, height: 1000, scheme: 'light' },
  { name: 'post-long-title-mobile', path: '/posts/format-showcase/', width: 390, height: 844, scheme: 'light' },
  { name: 'archive', path: '/tags/', width: 1440, height: 1000, scheme: 'light' },
  { name: 'friends', path: '/friends/', width: 1440, height: 1000, scheme: 'light' },
  { name: 'friends-mobile', path: '/friends/', width: 390, height: 844, scheme: 'light' },
  { name: 'about-mobile', path: '/about/', width: 390, height: 844, scheme: 'light' },
]

await fs.mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const pageErrors = []

function watchErrors(page, name) {
  page.on('pageerror', error => {
    pageErrors.push(`[${name}] ${error.message}`)
    console.error(pageErrors.at(-1))
  })
}

for (const item of cases) {
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    colorScheme: item.scheme,
  })
  const page = await context.newPage()
  watchErrors(page, item.name)
  const response = await page.goto(`${base}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  if (!response?.ok()) throw new Error(`[${item.name}] HTTP ${response?.status()} at ${item.path}`)
  await page.waitForTimeout(900)
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  if (overflows) throw new Error(`[${item.name}] horizontal page overflow`)
  // Scroll through the page once so lazy images and Mermaid finish rendering.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y)
      await new Promise(resolve => setTimeout(resolve, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${outDir}/${item.name}.png`, fullPage: true })
  console.log(`saved ${outDir}/${item.name}.png`)
  await context.close()
}

// Search dialog
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  const page = await context.newPage()
  watchErrors(page, 'search')
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+k')
  await page.locator('#search-input').fill('音乐')
  await page.waitForTimeout(450)
  if (!await page.locator('.search-result').count()) throw new Error('Search returned no music results')
  await page.screenshot({ path: `${outDir}/search.png` })
  console.log(`saved ${outDir}/search.png`)
  await context.close()
}

// Image zoom
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  const page = await context.newPage()
  watchErrors(page, 'image-zoom')
  await page.goto(`${base}/posts/format-showcase/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(800)
  await page.locator('.prose img[data-zoomable="true"]').first().click()
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${outDir}/image-zoom.png` })
  console.log(`saved ${outDir}/image-zoom.png`)
  await context.close()
}

// Mobile music card
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' })
  const page = await context.newPage()
  watchErrors(page, 'music-card-mobile')
  await page.goto(`${base}/posts/headphones-on/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(800)
  await page.locator('.mc-card').first().screenshot({ path: `${outDir}/music-card-mobile.png` })
  console.log(`saved ${outDir}/music-card-mobile.png`)
  await context.close()
}

await browser.close()
if (pageErrors.length) throw new Error(`Browser runtime errors:\n${pageErrors.join("\n")}`)
