/**
 * Pre-resolve every ::music{url="..."} in src/content and write the metadata
 * to src/data/music-cache.json. Run after adding or changing a music URL:
 *
 *   npm run music
 *
 * Adapted from the author's existing blog implementation. The cache is read at
 * build time, so normal builds do not need to call the music platforms.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const contentDir = path.resolve(root, 'src/content')
const cachePath = path.resolve(root, 'src/data/music-cache.json')
const URL_RE = /::music\s*\{[^}]*url\s*=\s*"([^"]+)"[^}]*\}/g

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else if (/\.(md|mdx)$/i.test(entry.name)) files.push(full)
  }
  return files
}

async function main() {
  const files = await walk(contentDir)
  const urls = new Set()
  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8')
    for (const match of content.matchAll(URL_RE)) urls.add(match[1])
  }

  if (!urls.size) {
    console.log('No ::music{url="..."} directives found.')
    return
  }

  let cache = {}
  try {
    cache = JSON.parse(await fs.readFile(cachePath, 'utf-8'))
  }
  catch {
    // Start with an empty cache.
  }

  const uncached = [...urls].filter(url => !cache[url])
  if (!uncached.length) {
    console.log(`All ${urls.size} music URLs are already cached.`)
    return
  }

  const { resolveMusicUrl } = await import(new URL('../src/utils/music-resolver.mjs', import.meta.url).href)
  console.log(`Resolving ${uncached.length} new music URLs…`)

  let resolved = 0
  let failed = 0
  for (const url of uncached) {
    try {
      const result = await resolveMusicUrl(url)
      cache[url] = result
      resolved += 1
      console.log(`  ✓ ${result.title || url}`)
    }
    catch (error) {
      failed += 1
      console.warn(`  ✗ ${url}: ${error.message}`)
    }
  }

  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8')
  console.log(`Done: ${resolved} resolved, ${failed} failed, ${urls.size} total.`)
}

main().catch((error) => {
  console.error('Fatal:', error)
  process.exit(1)
})