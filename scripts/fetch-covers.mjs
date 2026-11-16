/**
 * Fetch cover art for the shelf from Douban, once, at the author's request.
 *
 *   npm run covers
 *
 * Douban blocks hotlinking: its image hosts answer a browser request without
 * a Douban referrer with 418, so a page can never point at img*.doubanio.com
 * directly. The covers are therefore downloaded here and saved under
 * public/shelf/, where the site serves them itself. The script only runs when
 * the author asks for it; a normal build reads the committed files and never
 * touches the network.
 *
 * Input is the same Markdown the site reads: src/content/shelf/books.md,
 * films.md and music.md, one paragraph of `键：值` lines per work. For each
 * work without a `封面` line, this looks the title up in Douban's
 * subject-suggest endpoint, prefers the subject page the entry names (or a
 * hit whose year and creator agree), downloads the largest cover, and writes
 * the path back into src/data/shelf-covers.json.
 *
 * If Douban is unreachable or answers with nothing usable, the item is left
 * as it was: the page then typesets a cover from its title.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'

const root = process.cwd()
const outDir = path.resolve(root, 'public/shelf')
const cachePath = path.resolve(root, 'src/data/shelf-covers.json')
const shelfDir = path.resolve(root, 'src/content/shelf')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const TIMEOUT = 12000

const FILES = { 'books.md': 'book', 'films.md': 'film', 'music.md': 'music' }
const ENDPOINTS = {
  book: 'https://book.douban.com/j/subject_suggest?q=',
  film: 'https://movie.douban.com/j/subject_suggest?q=',
}
const REFERRER = { book: 'https://book.douban.com/', film: 'https://movie.douban.com/', music: 'https://music.douban.com/' }

async function fetchWithTimeout(url, headers = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'error', signal: controller.signal })
  }
  finally { clearTimeout(timer) }
}

/** Read the shelf Markdown. Mirrors src/utils/shelf.ts, without a build step. */
async function readShelf() {
  const items = []
  for (const [file, kind] of Object.entries(FILES)) {
    let source
    try { source = await readFile(path.join(shelfDir, file), 'utf8') }
    catch { continue }
    const text = source
      .replace(/\r\n?/g, '\n')
      .replace(/^---[\s\S]*?^---\s*$/m, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^#\s+.*$/gm, '')
    for (const block of text.split(/\n{2,}/)) {
      const fields = new Map()
      for (const raw of block.split('\n')) {
        const match = raw.match(/^\s*([^：:]{1,8})\s*[：:]\s*(.+?)\s*$/)
        if (match) fields.set(match[1].trim(), match[2].trim())
      }
      const title = fields.get('书名') ?? fields.get('片名') ?? fields.get('名称')
      if (!title) continue
      const year = Number(fields.get('年份') ?? '')
      items.push({
        kind,
        title,
        creator: fields.get('作者') ?? fields.get('导演') ?? fields.get('歌手') ?? '',
        year: Number.isFinite(year) ? year : 0,
        cover: fields.get('封面') ?? '',
        url: fields.get('豆瓣') ?? fields.get('链接') ?? '',
      })
    }
  }
  return items
}

const trimQuery = value => value.replace(/\?.*$/, '')

/** The subject page the entry names, if the search returns it. */
function namedSubject(candidates, item) {
  if (!item.url?.startsWith('https://')) return null
  const wanted = trimQuery(item.url).replace(/\/$/, '')
  return candidates.find(candidate => typeof candidate.url === 'string'
    && trimQuery(candidate.url).replace(/\/$/, '') === wanted) ?? null
}

/** Otherwise the best match: same year and creator win. */
function chooseCandidate(candidates, item) {
  const scored = candidates.map(candidate => {
    let score = 0
    if (item.year && Number(candidate.year) === item.year) score += 4
    if (item.creator && String(candidate.author_name ?? '').includes(item.creator)) score += 3
    if (candidate.title === item.title) score += 2
    if (candidate.pic || candidate.img) score += 1
    return { candidate, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.score > 0 ? scored[0].candidate : candidates[0]
}

/**
 * Cover URL from a Douban subject page. The suggest API is the fast path but
 * it rate-limits (it starts answering `[]`), and the subject page still has
 * the poster in its markup. The mobile page is used because the desktop one
 * now redirects an anonymous request.
 */
async function coverFromSubjectPage(item) {
  if (!/^https:\/\/(?:movie|book)\.douban\.com\/subject\/\d+/.test(item.url ?? '')) return null
  const mobile = item.url.replace('//movie.douban.com/', '//m.douban.com/movie/').replace('//book.douban.com/', '//m.douban.com/book/')
  const response = await fetchWithTimeout(mobile, {
    Referer: REFERRER[item.kind],
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  if (!response.ok) return null
  const html = await response.text()
  const poster = html.match(/https:\/\/img\d+\.doubanio\.com\/view\/photo\/[^"'\s]+/)
  return poster ? { pic: poster[0].replaceAll('\/', '/') } : null
}

/** Ask the image host for the largest size of a cover. */
function largeCover(url) {
  return url
    .replace('/view/subject/s/public/', '/view/subject/l/public/')
    .replace('/view/subject/m/public/', '/view/subject/l/public/')
    .replace('/view/photo/s_ratio_poster/public/', '/view/photo/l/public/')
    .replace('/view/photo/m_ratio_poster/public/', '/view/photo/l/public/')
    .replace(/^http:/, 'https:')
}

// Only Douban's own image hosts are fetched, never a URL the API could be
// tricked into handing back.
function isDoubanImage(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^img\d*\.doubanio\.com$/.test(url.hostname)
  }
  catch { return false }
}

async function downloadCover(item, candidate) {
  const url = largeCover(candidate.pic ?? candidate.img)
  if (!isDoubanImage(url)) throw new Error('not a Douban image')
  const response = await fetchWithTimeout(url, { Referer: REFERRER[item.kind] })
  if (!response.ok) throw new Error(`image ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!/^image\/(jpeg|png|webp)/.test(type)) throw new Error(`unexpected image type ${type}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength < 2048 || bytes.byteLength > 8 * 1024 * 1024) throw new Error('image size out of range')
  // Douban hands back print-sized scans (1600x2400, 600KB); the wall shows
  // posters about 200px wide, so 800px tall covers a retina screen.
  const reencoded = await sharp(bytes)
    .rotate()
    .resize({ height: 800, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer()
  // A stable name means a re-run rewrites the same file instead of piling up.
  const name = createHash('sha256').update(`${item.kind}\n${item.title}`).digest('hex').slice(0, 12)
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, `${name}.jpg`), reencoded)
  return `/shelf/${name}.jpg`
}

async function main() {
  const items = await readShelf()
  let cache = {}
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')) }
  catch { /* first run */ }

  const only = process.argv.slice(2)
  const todo = items.filter(item => !item.cover && (!only.length || only.includes(item.title)))
  if (!todo.length) {
    console.log('Every shelf item has a cover already, or nothing matched the arguments.')
    return
  }

  let saved = 0
  let failed = 0
  for (const item of todo) {
    const key = `${item.kind}:${item.title}`
    if (cache[key] && existsSync(path.resolve(root, 'public' + cache[key]))) {
      console.log(`  = ${item.title} (cached)`)
      continue
    }
    const endpoint = ENDPOINTS[item.kind]
    if (!endpoint) {
      console.log(`  – ${item.title}: music covers come from the music cache, skipped`)
      continue
    }
    try {
      const response = await fetchWithTimeout(endpoint + encodeURIComponent(item.title), { Referer: REFERRER[item.kind] })
      if (!response.ok) throw new Error(`search ${response.status}`)
      const candidates = await response.json()
      // The suggest endpoint returns [] once it rate-limits; the subject page
      // the entry names is the reliable fallback.
      const candidate = Array.isArray(candidates) && candidates.length
        ? namedSubject(candidates, item) ?? chooseCandidate(candidates, item)
        : await coverFromSubjectPage(item)
      if (!candidate) throw new Error('no match')
      const cover = await downloadCover(item, candidate)
      cache[key] = cover
      saved += 1
      console.log(`  ✓ ${item.title} -> ${cover}${candidate.year ? ` (${candidate.year})` : ''}`)
    }
    catch (error) {
      failed += 1
      console.log(`  x ${item.title}: ${error.message}`)
    }
  }

  await mkdir(path.dirname(cachePath), { recursive: true })
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  console.log(`\nDone: ${saved} saved, ${failed} failed, ${todo.length} considered.`)
  console.log('Covers live in public/shelf/ and are read through src/data/shelf-covers.json.')
  if (failed) console.log('Items that failed keep their typeset cover; run again to retry.')
}

await main()
