/**
 * Build-time music URL resolver.
 * Uses platform-specific strategies to extract metadata.
 * Supports: Spotify, Apple Music, Netease, QQ Music.
 * After resolving primary metadata, searches other platforms for the same song/album.
 *
 * Adapted from the author's earlier private blog implementation. Kept close
 * to the original on purpose: the cross-platform matching, retries and
 * git-committed cache are the parts that make it useful.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// Hostnames are matched exactly after parsing, never with a substring test:
// this keeps a URL like http://169.254.169.254/music.163.com/ from becoming
// a build-time fetch target.
const PLATFORM_HOSTS = {
  spotify: 'open.spotify.com',
  apple: 'music.apple.com',
  netease: 'music.163.com',
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SEARCH_TIMEOUT = 8000

// ── concurrency limiter ────────────────────────────────

function createConcurrencyLimit(max = 4) {
  const pending = []
  let inFlight = 0
  return async function run(fn) {
    if (inFlight >= max) {
      await new Promise((r) => pending.push(r))
    }
    inFlight++
    try {
      return await fn()
    } finally {
      inFlight--
      if (pending.length) pending.shift()()
    }
  }
}

const concurrencyLimit = createConcurrencyLimit()

export function detectPlatform(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl ?? ''))
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const path = url.pathname

  if (host === PLATFORM_HOSTS.spotify && /^\/(?:[^/]+\/)?(track|album)\/[a-zA-Z0-9]+/.test(path)) {
    return 'spotify'
  }
  if (host === PLATFORM_HOSTS.apple && /(?:^|\/)(album|song|playlist)\//.test(path)) {
    return 'apple'
  }
  if (host === PLATFORM_HOSTS.netease) {
    if (/\/(song|album)\//.test(path) || /#\/(song|album)/.test(url.hash)) return 'netease'
  }
  if ((host === 'y.qq.com' || host === 'i.y.qq.com') && /\/.+\/(songDetail|albumDetail|playsong)\//.test(path)) {
    return 'qqmusic'
  }
  return null
}

// Apply the same boundary to every request, including API calls and redirect
// hops. Checking only detectPlatform() cannot constrain fetch's default follow.
const FETCH_HOSTS = new Set([
  'open.spotify.com', 'www.open.spotify.com',
  'music.apple.com', 'www.music.apple.com', 'itunes.apple.com',
  'music.163.com', 'www.music.163.com',
  'y.qq.com', 'www.y.qq.com', 'i.y.qq.com', 'www.i.y.qq.com', 'c.y.qq.com',
])
const MAX_REDIRECTS = 5
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

function checkedFetchUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !FETCH_HOSTS.has(url.hostname)
    || url.username || url.password || url.port) {
    throw new Error('Disallowed music fetch URL')
  }
  return url
}

async function fetchMusic(url, options = {}) {
  let target = checkedFetchUrl(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target.href, {
      ...options,
      credentials: 'omit',
      redirect: 'manual',
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    await response.body?.cancel()
    const location = response.headers.get('location')
    if (!location || hop === MAX_REDIRECTS) throw new Error('Invalid music redirect chain')
    target = checkedFetchUrl(new URL(location, target))
  }
  throw new Error('Too many music redirects')
}

async function readMusicText(response) {
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('HTTP ' + response.status)
  }
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new Error('Music response exceeds byte limit')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw new Error('Music response exceeds byte limit')
      chunks.push(decoder.decode(value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  }
  catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  finally {
    reader.releaseLock()
  }
}

function fetchText(url, timeout = 10000) {
  return fetchMusic(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(timeout),
  }).then(readMusicText)
}

function fetchJson(url, timeout = 10000) {
  return fetchMusic(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
  }).then(readMusicText).then(JSON.parse)
}

async function fetchWithRetry(url, options, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchMusic(url, options)
      return JSON.parse(await readMusicText(res))
    } catch (err) {
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }
      throw err
    }
  }
}

// ── cross-platform search functions ──────────────────────────────────────────

// Character-level overlap ratio for CJK text (handles traditional/simplified differences)
function charOverlap(a, b) {
  const chars = [...new Set([...a])]
  if (!chars.length) return 0
  let matchCount = 0
  for (const c of chars) {
    if (b.includes(c)) matchCount++
  }
  return matchCount / chars.length
}

function scoreTitle(resultName, originalTitle) {
  if (!originalTitle) return 100
  const rn = resultName.toLowerCase().trim()
  const ot = originalTitle.toLowerCase().trim()
  if (!rn || !ot) return 0

  if (rn === ot || rn.includes(ot) || ot.includes(rn)) return 100

  const rWords = rn.split(/\s+/).filter(Boolean)
  const oWords = ot.split(/\s+/).filter(Boolean)
  if (!rWords.length || !oWords.length) return 0

  let matches = 0
  for (const ow of oWords) {
    if (rWords.some((rw) => rw.includes(ow) || ow.includes(rw) || charOverlap(rw, ow) >= 0.5)) matches++
  }
  return Math.round((matches / Math.max(oWords.length, rWords.length)) * 100)
}

function scoreArtist(resultArtist, originalArtist) {
  if (!originalArtist) return 100
  const ra = resultArtist.toLowerCase().trim()
  const oa = originalArtist.toLowerCase().trim()
  if (!ra || !oa) return 0

  if (ra === oa || ra.includes(oa) || oa.includes(ra)) return 100

  const rWords = ra.split(/\s+/).filter(Boolean)
  const oWords = oa.split(/\s+/).filter(Boolean)
  if (!rWords.length || !oWords.length) return 0

  let matches = 0
  for (const ow of oWords) {
    if (rWords.some((rw) => rw.includes(ow) || ow.includes(rw) || charOverlap(rw, ow) >= 0.5)) matches++
  }
  return Math.round((matches / Math.max(oWords.length, rWords.length)) * 100)
}

function bestResult(results, scorer) {
  let best = null
  let bestScore = 0
  for (const r of results) {
    const score = scorer(r)
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  return bestScore >= 40 ? best : null
}

async function searchApple(query, type, originalArtist, originalTitle) {
  const entity = type === 'album' ? 'album' : 'song'
  for (const country of ['cn', 'us']) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&entity=${entity}&country=${country}`
    let data
    try {
      data = await fetchWithRetry(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT),
      }, 1)
    } catch {
      continue
    }

    if (!data.results?.length) continue

    if (entity === 'song') {
      const r = bestResult(data.results, (result) => {
        const name = result.trackName || ''
        const s = scoreTitle(name, originalTitle)
        const as = result.artistName ? scoreArtist(result.artistName, originalArtist) : 0
        return s * 0.5 + as * 0.5
      })
      if (r && r.trackId) {
        const slug = r.trackName ? encodeURIComponent(r.trackName) : '_'
        return `https://music.apple.com/${country}/song/${slug}/${r.trackId}`
      }
    } else {
      const r = bestResult(data.results, (result) => {
        return result.collectionName ? scoreTitle(result.collectionName, originalTitle) : 0
      })
      if (r && r.collectionId) {
        const slug = r.collectionName ? encodeURIComponent(r.collectionName) : '_'
        return `https://music.apple.com/${country}/album/${slug}/${r.collectionId}`
      }
    }
  }
  return null
}

async function searchNetease(query, type, originalArtist, originalTitle) {
  const searchType = type === 'album' ? 10 : 1
  const url = `https://music.163.com/api/cloudsearch/pc?csrf_token=&type=${searchType}&s=${encodeURIComponent(query)}&limit=5`
  let data
  try {
    data = await fetchWithRetry(url, {
      headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT),
    }, 1)
  } catch {
    return null
  }

  if (!data?.result) return null

  if (searchType === 10 && data.result.albums?.length) {
    const r = bestResult(data.result.albums, (album) => {
      return album.name ? scoreTitle(album.name, originalTitle) : 0
    })
    if (r) return 'https://music.163.com/#/album?id=' + r.id
    return null
  }

  if (data.result.songs?.length) {
    const r = bestResult(data.result.songs, (song) => {
      const s = song.name ? scoreTitle(song.name, originalTitle) : 0
      const as = (originalArtist && song.ar?.length)
        ? Math.max(...song.ar.map((a) => a.name ? scoreArtist(a.name, originalArtist) : 0))
        : 100
      return s * 0.5 + as * 0.5
    })
    if (r) return 'https://music.163.com/#/song?id=' + r.id
  }
  return null
}

async function searchQQ(query, type, originalArtist, originalTitle) {
  try {
    const isAlbum = type === 'album'
    const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(query)}&format=json&p=1&n=5${isAlbum ? '&t=8' : ''}`
    const text = await fetchText(url, SEARCH_TIMEOUT)
    const jsonStr = text.replace(/^\w+\(/, '').replace(/\);?\s*$/, '').trim()
    const data = JSON.parse(jsonStr)

    if (isAlbum) {
      const list = data?.data?.album?.list || data?.data?.list || data?.album?.list
      if (list?.length) {
        const r = bestResult(list, (album) => {
          return album.albumName ? scoreTitle(album.albumName, originalTitle) : 0
        })
        if (r && r.albumMID) return 'https://y.qq.com/n/ryqq/albumDetail/' + r.albumMID
      }
    } else {
      const list = data?.data?.song?.list || data?.data?.list || data?.song?.list
      if (list?.length) {
        const r = bestResult(list, (song) => {
          const s = song.songname ? scoreTitle(song.songname, originalTitle) : 0
          const as = (originalArtist && song.singer?.length)
            ? Math.max(...song.singer.map((s) => s.name ? scoreArtist(s.name, originalArtist) : 0))
            : 100
          return s * 0.5 + as * 0.5
        })
        if (r && r.songmid) return 'https://y.qq.com/n/ryqq/songDetail/' + r.songmid
      }
    }
  } catch {
    return null
  }

  return null
}

const searchFunctions = {
  apple: searchApple,
  netease: searchNetease,
  qqmusic: searchQQ,
}

// ── extractors ──────────────────────────────────────────────────────────────

async function resolveSpotify(url) {
  let title = ''
  let artist = ''
  let cover = ''
  try {
    const oembed = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
    title = oembed.title || ''
    cover = oembed.thumbnail_url || ''
    artist = oembed.author_name || ''
  } catch { /* oembed failure is non-fatal */ }

  if (!artist) {
    try {
      const html = await fetchText(url)
      if (html.length >= 10000) {
        const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/is)
        if (ldMatch) {
          const data = JSON.parse(ldMatch[1])
          if (data.byArtist?.name) {
            artist = data.byArtist.name
          } else if (data.description) {
            const parts = data.description.split('·').map(s => s.trim())
            if (parts.length >= 3 && parts[0].startsWith('Listen to ')) {
              artist = parts[2] || ''
            } else if (parts.length >= 2) {
              artist = parts[1] || ''
            }
          }
        }
        if (!artist) {
          const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
          if (ogDesc) {
            const parts = ogDesc[1].split('·').map(s => s.trim())
            artist = parts[0] || ''
          }
        }
        if (!artist) {
          const titleTag = html.match(/<title>([^<]+)<\/title>/i)
          if (titleTag && !titleTag[1].includes('Web Player')) {
            const parts = titleTag[1].split('|')
            if (parts.length >= 2) {
              artist = parts[1].trim().replace(/^by\s+/i, '')
            }
          }
        }
      }
    } catch { /* artist stays empty */ }
  }

  if (!title) title = 'Spotify Track'
  const type = url.includes('/album/') ? 'album' : 'single'
  return { title, artist, cover, type, platform: 'spotify' }
}

async function resolveApple(url) {
  const idMatch = url.match(/(\d+)(?:\/|$)/)
  if (!idMatch) throw new Error('Could not extract Apple Music catalog ID')

  const id = idMatch[1]
  const data = await fetchJson(`https://itunes.apple.com/lookup?id=${id}`)

  if (!data.results?.length) throw new Error(`No iTunes result for id ${id}`)

  const item = data.results[0]
  const title = item.trackName || item.collectionName || ''
  const artist = item.artistName || ''
  const cover = (item.artworkUrl100 || '').replace('100x100', '300x300')
  const type = item.wrapperType === 'collection' ? 'album' : 'single'

  return { title, artist, cover, type, platform: 'apple' }
}

async function resolveNetease(url) {
  let match = url.match(/\/(song|album)\/(\d+)/i)
  if (!match) match = url.match(/#\/(song|album)\?id=(\d+)/i)
  if (!match) throw new Error('Could not extract Netease ID from URL')

  const [, type, id] = match
  const isAlbum = type === 'album'

  const headers = { 'User-Agent': UA, Referer: 'https://music.163.com/' }

  if (isAlbum) {
    const res = await fetchMusic(`https://music.163.com/api/v1/album/${id}`, { headers, signal: AbortSignal.timeout(10000) })
    const data = JSON.parse(await readMusicText(res))
    const songs = data?.songs
    if (!songs?.length) throw new Error('Netease album not found')
    const first = songs[0]
    const title = first.al?.name || ''
    const artist = first.ar?.map?.((a) => a.name).join(', ') || ''
    const cover = first.al?.picUrl || ''
    return { title, artist, cover, type: 'album', platform: 'netease' }
  } else {
    const res = await fetchMusic(`https://music.163.com/api/song/detail?id=${id}&ids=[${id}]`, { headers, signal: AbortSignal.timeout(10000) })
    const data = JSON.parse(await readMusicText(res))
    const song = data?.songs?.[0]
    if (!song) throw new Error('Netease song not found')
    const artist = song.artists?.map?.((a) => a.name).join(', ') || song.artists?.[0]?.name || ''
    return {
      title: song.name || '',
      artist,
      cover: song.album?.picUrl || '',
      type: 'single',
      platform: 'netease',
    }
  }
}

async function resolveQqmusic(url) {
  let title = ''
  let artist = ''
  let cover = ''
  try {
    const html = await fetchText(url)
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    if (ogTitle) {
      const parts = ogTitle[1].split(/[—–-]/)
      title = parts[0]?.trim() || ''
      artist = parts[1]?.trim() || ''
    }
  } catch {
    // Use empty values
  }

  const type = /albumDetail|album\b/i.test(url) ? 'album' : 'single'

  return { title: title || '', artist: artist || '', cover, type, platform: 'qqmusic' }
}

// ── file cache (git-committed, read at build time) ──────────────────────

let fileCache = null

function loadFileCache() {
  if (fileCache !== null) return fileCache
  try {
    const cachePath = path.resolve(process.cwd(), 'src/data/music-cache.json')
    const raw = fs.readFileSync(cachePath, 'utf-8')
    fileCache = JSON.parse(raw)
  } catch {
    fileCache = {}
  }
  return fileCache
}

// ── in-memory cache (per-build) ───────────────────────────────────────────

const resolveCache = new Map()

const resolvers = {
  spotify: resolveSpotify,
  apple: resolveApple,
  netease: resolveNetease,
  qqmusic: resolveQqmusic,
}

export async function resolveMusicUrl(url) {
  // Check file cache first (git-committed, persisted across builds)
  const fc = loadFileCache()
  if (fc[url]) {
    resolveCache.set(url, fc[url])
    return fc[url]
  }

  if (resolveCache.has(url)) {
    return resolveCache.get(url)
  }

  const platform = detectPlatform(url)
  if (!platform) throw new Error(`Unsupported music platform URL: ${url}`)

  const resolver = resolvers[platform]

  let result
  try {
    result = await concurrencyLimit(() => resolver(url))
  } catch (err) {
    console.error(`[music-resolver] Failed to resolve ${platform} URL: ${url}\n  ${err.message}`)
    result = { title: '', artist: '', cover: '', type: 'single', platform, url }
  }

  result.url = url
  result.links = { [platform]: url }

  // Cross-platform search
  const query = (result.title + ' ' + result.artist).trim()
  if (query) {
    const tasks = []
    for (const [p, searchFn] of Object.entries(searchFunctions)) {
      if (p === platform) continue
      tasks.push(
        concurrencyLimit(() => searchFn(query, result.type, result.artist, result.title))
          .then((link) => {
            if (link) result.links[p] = link
          })
          .catch(() => { /* platform search failed, skip */ }),
      )
    }
    await Promise.all(tasks)

    // Backfill missing artist from cross-platform results
    if (!result.artist) {
      if (result.links.netease && platform !== 'netease') {
        try {
          const neteaseInfo = await concurrencyLimit(() => resolvers.netease(result.links.netease))
          if (neteaseInfo.artist) result.artist = neteaseInfo.artist
          if (neteaseInfo.cover) result.cover = neteaseInfo.cover
        } catch { /* keep original */ }
      } else if (result.links.apple && platform !== 'apple') {
        try {
          const appleInfo = await concurrencyLimit(() => resolvers.apple(result.links.apple))
          if (appleInfo.artist) result.artist = appleInfo.artist
        } catch { /* keep original */ }
      }
    } else if (result.links.netease && platform !== 'netease') {
      try {
        const neteaseInfo = await concurrencyLimit(() => resolvers.netease(result.links.netease))
        if (neteaseInfo.cover) result.cover = neteaseInfo.cover
      } catch { /* keep original cover */ }
    }
  }

  resolveCache.set(url, result)
  return result
}
