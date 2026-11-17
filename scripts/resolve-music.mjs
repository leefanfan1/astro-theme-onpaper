/**
 * Pre-resolve every ::music{url="..."} in src/content and write the metadata
 * to src/data/music-cache.json, then download each card's cover into
 * public/music/. Run after adding or changing a music URL:
 *
 *   npm run music
 *
 * Adapted from the author's existing blog implementation. The cache is read at
 * build time, so normal builds do not need to call the music platforms.
 *
 * The cover is stored rather than hotlinked: one origin for the page, the
 * immutable cache header public/_headers sets for /music/*, and no card that
 * breaks when an image host changes its rules. A cover that cannot be fetched
 * leaves the card's remote URL in place, so the card still shows a picture.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { planMusicPrune } from './cover-prune.mjs'

const root = process.cwd()
const contentDir = path.resolve(root, 'src/content')
const cachePath = path.resolve(root, 'src/data/music-cache.json')
const coverDir = path.resolve(root, 'public/music')
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

/** The ::music URLs still in src/content, or null if it could not be read. */
async function liveUrls() {
  try {
    const files = await walk(contentDir)
    const urls = new Set()
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8')
      for (const match of content.matchAll(URL_RE)) urls.add(match[1])
    }
    return [...urls]
  }
  catch {
    return null
  }
}

/** The file names present in public/music/, or none if the folder is not there. */
async function storedCovers() {
  try {
    return (await fs.readdir(coverDir, { withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
  }
  catch {
    return []
  }
}

async function main() {
  const urls = await liveUrls()
  if (urls === null) {
    console.warn('src/content could not be read; leaving the cache and covers alone.')
    return
  }
  if (!urls.length) console.log('No ::music{url="..."} directives found.')

  let cache = {}
  try {
    cache = JSON.parse(await fs.readFile(cachePath, 'utf-8'))
  }
  catch {
    // Start with an empty cache.
  }

  const uncached = urls.filter(url => !cache[url])
  const { resolveMusicUrl } = await import(new URL('../src/utils/music-resolver.mjs', import.meta.url).href)
  if (uncached.length) console.log(`Resolving ${uncached.length} new music URLs…`)

  let resolved = 0
  let failed = 0
  for (const url of uncached) {
    try {
      cache[url] = await resolveMusicUrl(url)
      resolved += 1
      console.log(`  ✓ ${cache[url].title || url}`)
    }
    catch (error) {
      failed += 1
      console.warn(`  ✗ ${url}: ${error.message}`)
    }
  }

  // Every card's cover, not just the newly resolved ones: a cache written
  // before covers were stored has no file yet, and the cheap path (the file is
  // already there under this name) is checked before any request.
  const { storeMusicCover } = await import(new URL('./music-cover-store.mjs', import.meta.url).href)
  let saved = 0
  let unsaved = 0
  for (const url of urls) {
    const info = cache[url]
    if (!info) continue
    try {
      if (await storeMusicCover(info)) saved += 1
      else unsaved += 1
    }
    catch (error) {
      // The card falls back to the remote cover, so this is not a failure.
      unsaved += 1
      console.warn(`  ~ ${info.title || url}: cover not stored (${error.message})`)
    }
  }

  // A card deleted from a post leaves its cover in public/music/; a run says so
  // and removes it. An unreadable content folder removes nothing.
  const plan = planMusicPrune({ urls, cache, files: await storedCovers() })
  if (plan.skipped) console.log(`= covers: ${plan.skipped}; removed nothing`)
  for (const file of plan.remove) {
    await fs.rm(path.join(coverDir, file), { force: true })
    console.log(`  - /music/${file}`)
  }

  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8')
  const stored = urls.filter(url => cache[url]?.coverFile).length
  console.log(`Done: ${resolved} resolved, ${failed} failed, ${stored}/${urls.length} cover(s) local, ${plan.remove.length} removed.`)
}

main().catch((error) => {
  console.error('Fatal:', error)
  process.exit(1)
})
