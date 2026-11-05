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
  { name: 'post-extensions', path: '/posts/a-little-margin/', width: 1440, height: 1000, scheme: 'dark' },
  { name: 'post-mobile', path: '/posts/a-little-margin/', width: 390, height: 844, scheme: 'light' },
  { name: 'archive', path: '/tags/', width: 1440, height: 1000, scheme: 'light' },
  { name: 'about-mobile', path: '/about/', width: 390, height: 844, scheme: 'light' },
]

await fs.mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

for (const item of cases) {
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    colorScheme: item.scheme,
  })
  const page = await context.newPage()
  page.on('pageerror', error => console.error(`[${item.name}] ${error.message}`))
  await page.goto(`${base}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(900)
  // Scroll through the page once so lazy images and Mermaid finish rendering.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise(resolve => setTimeout(resolve, 55))
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
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+k')
  await page.locator('#search-input').fill('音乐')
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${outDir}/search.png` })
  console.log(`saved ${outDir}/search.png`)
  await context.close()
}

await browser.close()