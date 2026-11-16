/**
 * Complete the shelf from Douban, once, at the author's request.
 *
 *   npm run covers
 *   node scripts/fetch-covers.mjs 城南旧事 一一     # only these entries
 *
 * For each entry in src/content/shelf/{books,films,music}.md this fills in the
 * fields the entry leaves out — creator, year and the subject page — and
 * fetches the cover. It never overwrites a line the author wrote: a book that
 * says 1960 keeps 1960 even though Douban's edition says 2008.
 *
 * The three entries of the "最近" column (src/content/pages/now.md) go through
 * the same lookups, with no cover: the column shows no pictures, and its year
 * and a record's Douban page are recorded in the file for reference only.
 *
 * Covers are saved rather than hotlinked. Douban rejects a browser request
 * without a Douban referrer with 418, so books and films have their poster
 * downloaded into public/shelf/ and recorded in src/data/shelf-covers.json;
 * a record's cover comes from NetEase (via the same resolver the `::music`
 * card uses) and is recorded there as a URL, which the shelf page sizes for
 * the wall.
 *
 * Music entries follow the music card's own logic: a `链接：` line is resolved
 * with src/utils/music-resolver.mjs and its result cached in
 * src/data/music-cache.json; an entry with no link is looked up on NetEase by
 * name and artist, and the address it finds is written back. The `链接：` line
 * is then pointed at NetEase, so the card opens the player rather than a
 * streaming service the author may not use.
 *
 * If Douban is unreachable or answers with nothing usable, the entry is left
 * exactly as it was: the page then typesets a cover from its title, and the
 * next run tries again.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'
import { findSubject, posterFromPage, subjectDetail, subjectUrl } from './douban.mjs'
import { nowEntriesOf, rewriteNow } from './now-document.mjs'
import { entriesOf, rewriteDocument } from './shelf-document.mjs'
import { parseEntry } from './shelf-fields.mjs'

const root = process.cwd()
const outDir = path.resolve(root, 'public/shelf')
const coverCachePath = path.resolve(root, 'src/data/shelf-covers.json')
const musicCachePath = path.resolve(root, 'src/data/music-cache.json')
const shelfDir = path.resolve(root, 'src/content/shelf')
const nowPath = path.resolve(root, 'src/content/pages/now.md')

const TIMEOUT = 12000

const FILES = { 'books.md': 'book', 'films.md': 'film', 'music.md': 'music' }
const REFERRER = { book: 'https://book.douban.com/', film: 'https://movie.douban.com/', music: 'https://music.douban.com/' }
// The key each kind's creator goes under, as written in the Markdown.
const CREATOR_KEY = { book: '作者', film: '导演', music: '歌手' }

async function fetchWithTimeout(url, headers = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    return await fetch(url, { headers, redirect: 'error', signal: controller.signal })
  }
  finally { clearTimeout(timer) }
}

/** The shelf files, each with the entries it holds outside its comments. */
async function readShelf() {
  const files = []
  for (const [file, kind] of Object.entries(FILES)) {
    let text
    try { text = await readFile(path.join(shelfDir, file), 'utf8') }
    catch { continue }
    const entries = entriesOf(text, kind).map(({ lines }) => {
      const { fields, title } = parseEntry(lines)
      return {
        title: title(kind),
        creator: fields.get(CREATOR_KEY[kind]) ?? '',
        year: Number(fields.get('年份') ?? '') || 0,
        cover: fields.get('封面') ?? '',
        // `url` is the Douban page for every kind; `link` is a record's player.
        url: fields.get('豆瓣') ?? '',
        link: fields.get('链接') ?? '',
        douban: fields.get('豆瓣') ?? '',
      }
    })
    files.push({ file: path.join(shelfDir, file), kind, text, entries })
  }
  return files
}

/** Ask the image host for the largest size of a Douban cover. */
function largeCover(url) {
  return url
    .replace('/view/subject/s/public/', '/view/subject/l/public/')
    .replace('/view/subject/m/public/', '/view/subject/l/public/')
    .replace('/view/photo/s_ratio_poster/public/', '/view/photo/l/public/')
    .replace('/view/photo/m_ratio_poster/public/', '/view/photo/l/public/')
    .replace(/^http:/, 'https:')
}

// Only Douban's own image hosts are fetched, never a URL an API could be
// tricked into handing back.
function isDoubanImage(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^img\d*\.doubanio\.com$/.test(url.hostname)
  }
  catch { return false }
}

async function downloadCover(item, pic) {
  const url = largeCover(pic)
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

/**
 * Whether an entry already has everything this script would fill in, so a
 * second run costs no requests. A cover counts as present when the entry
 * names one, or when the cache has a file (books, films) or a URL (records)
 * for it.
 */
function isComplete(item, kind, key, covers) {
  const cover = item.cover || covers[key]
  if (!cover) return false
  if (kind === 'music') {
    return Boolean(item.creator && item.year && item.douban && /^https:\/\/music\.163\.com\//.test(item.link))
  }
  const downloaded = cover.startsWith('/') ? existsSync(path.resolve(root, 'public' + cover)) : true
  return Boolean(item.creator && item.year && item.url && downloaded)
}

/**
 * A record: resolve the music card's own data for it, and find the address on
 * NetEase that the shelf will link to. Returns `{ info, neteaseUrl }`, where
 * `info` is null when nothing could be resolved at all.
 */
async function resolveRecord(item, cache) {
  const { resolveMusicUrl, resolveNetease, searchNetease } = await import(
    new URL('../src/utils/music-resolver.mjs', import.meta.url).href
  )

  let info = null
  let neteaseUrl = ''

  if (item.link) {
    info = await resolveMusicUrl(item.link)
    cache[item.link] = info
    // `links.netease` is what the cross-platform search found; failing that, a
    // NetEase address is its own answer.
    neteaseUrl = info.links?.netease ?? (info.platform === 'netease' ? item.link : '')
  }

  if (!neteaseUrl && item.title) {
    // No link, or a link the cross-platform search could not match: look the
    // record up on NetEase by the name the entry gives.
    neteaseUrl = await searchNetease(
      [item.title, item.creator].filter(Boolean).join(' '),
      info?.type === 'single' ? 'single' : 'album',
      item.creator,
      item.title,
    ) ?? ''
  }

  if (neteaseUrl) {
    const netease = await resolveNetease(neteaseUrl)
    const links = { ...info?.links, netease: neteaseUrl }
    // The resolver caches under the URL a card would be given; the shelf links
    // to NetEase, so the NetEase address is cached too.
    cache[neteaseUrl] = { ...netease, url: neteaseUrl, links }
    info = { ...info, ...netease, links }
  }

  return { info, neteaseUrl }
}

/**
 * The "最近" entries. No cover is fetched: the column renders no picture, and
 * the year (and a record's Douban page) is written into the file only. Named
 * entries are not selectable here — the shelf arguments filter the shelf — so
 * this pass is skipped when the run was asked for particular entries.
 */
async function completeNow(musicCache, shelfFacts) {
  let text
  try { text = await readFile(nowPath, 'utf8') }
  catch { return { files: 0, failed: 0 } }

  const updates = new Map()
  let complete = 0
  let failed = 0
  for (const entry of nowEntriesOf(text)) {
    // Already complete: a year line, and for a record its Douban page. A
    // second run then costs no requests.
    const hasYear = entry.lines.some(line => /^\s*年份\s*[：:]/.test(line))
    const hasDouban = entry.lines.some(line => /^\s*豆瓣\s*[：:]/.test(line))
    if (hasYear && (entry.kind !== 'music' || hasDouban)) {
      console.log(`  = ${entry.label}《${entry.title}》 (complete)`)
      complete += 1
      continue
    }
    try {
      if (entry.kind === 'music') {
        const { info, neteaseUrl } = await resolveRecord(
          { title: entry.title, creator: entry.creator, year: 0, link: entry.url, cover: '' },
          musicCache,
        )
        if (!info) throw new Error('no NetEase match')
        const subject = await findSubject('music', {
          title: entry.title,
          creator: info.artist || entry.creator,
          year: info.year || 0,
        }).catch(() => null)
        updates.set(entry.title, {
          kind: 'music',
          year: info.year ? String(info.year) : '',
          douban: subject ? subjectUrl('music', subject.id) : '',
          link: neteaseUrl,
        })
        console.log(`  ✓ ${entry.label}《${entry.title}》${info.artist ? ` / ${info.artist}` : ''}${info.year ? ` (${info.year})` : ''}`)
        continue
      }

      const subject = await findSubject(entry.kind, {
        title: entry.title,
        creator: entry.creator,
        year: 0,
        url: entry.url,
      })
      if (!subject) throw new Error('no Douban match')
      const detail = await subjectDetail(entry.kind, subject.id)
      // A year the shelf already states wins: same work, same answer.
      const year = shelfFacts.get(entry.title)?.year || detail?.year || subject.year || ''
      updates.set(entry.title, {
        kind: entry.kind,
        year: year ? String(year) : '',
        douban: subjectUrl(entry.kind, subject.id),
      })
      console.log(`  ✓ ${entry.label}《${entry.title}》${year ? ` (${year})` : ''}`)
    }
    catch (error) {
      failed += 1
      console.log(`  x ${entry.label}《${entry.title}》: ${error.message}`)
    }
  }

  if (!updates.size) {
    if (complete) console.log(`  = now.md: ${complete} complete entr${complete === 1 ? 'y' : 'ies'}`)
    return { files: 0, failed }
  }
  const result = rewriteNow(text, updates)
  if (!result.changed.length) {
    console.log('  = now.md: nothing to add')
    return { files: 0, failed }
  }
  await writeFile(nowPath, result.text, 'utf8')
  for (const { title, keys } of result.changed) console.log(`  + 《${title}》: ${keys.join('、')}`)
  return { files: 1, failed }
}

async function main() {
  const files = await readShelf()
  let covers = {}
  try { covers = JSON.parse(await readFile(coverCachePath, 'utf8')) }
  catch { /* first run */ }
  let musicCache = {}
  try { musicCache = JSON.parse(await readFile(musicCachePath, 'utf8')) }
  catch { /* first run */ }

  const only = process.argv.slice(2)
  const wanted = item => !only.length || only.includes(item.title)
  const considered = files.reduce((sum, file) => sum + file.entries.filter(wanted).length, 0)
  if (!considered) {
    console.log('No shelf entries matched the arguments.')
    return
  }

  // What the shelf already says about a work, by title: the "最近" column
  // names the same books and films, and a year the author typed there should
  // not disagree with the one they typed on the shelf.
  const shelfFacts = new Map()
  for (const file of files) {
    for (const item of file.entries) {
      if (!item.year) continue
      shelfFacts.set(item.title, { year: String(item.year) })
    }
  }

  const coversBefore = Object.keys(covers).length
  let complete = 0
  let failed = 0
  let filesUpdated = 0

  for (const file of files) {
    const updates = new Map()

    for (const item of file.entries) {
      if (!wanted(item)) continue
      const key = `${file.kind}:${item.title}`
      if (isComplete(item, file.kind, key, covers)) {
        console.log(`  = ${item.title} (complete)`)
        complete += 1
        continue
      }

      if (file.kind === 'music') {
        try {
          const { info, neteaseUrl } = await resolveRecord(item, musicCache)
          if (!info) throw new Error('no NetEase match')
          // The record's Douban page is recorded for reference only: the card
          // still opens the player. A lookup that fails leaves the line alone.
          const subject = await findSubject('music', {
            title: item.title,
            creator: info.artist || item.creator,
            year: info.year || item.year,
          }).catch(() => null)
          updates.set(item.title, [
            { key: '歌手', value: info.artist },
            { key: '年份', value: info.year ? String(info.year) : '' },
            // The card opens the player, so `链接` becomes the NetEase page.
            { key: '链接', value: neteaseUrl, mode: 'set' },
            { key: '豆瓣', value: subject ? subjectUrl('music', subject.id) : '' },
          ])
          if (!item.cover && info.cover) covers[key] = info.cover
          console.log(`  ✓ ${item.title}${info.artist ? ` / ${info.artist}` : ''}${info.year ? ` (${info.year})` : ''}${subject ? ` -> ${subjectUrl('music', subject.id)}` : ''}`)
        }
        catch (error) {
          failed += 1
          console.log(`  x ${item.title}: ${error.message}`)
        }
        continue
      }

      try {
        const subject = await findSubject(file.kind, {
          title: item.title,
          creator: item.creator,
          year: item.year,
          url: item.url,
        })
        if (!subject) throw new Error('no Douban match')

        // The mobile-subject endpoint names the creator and the publication
        // date properly; the search hit is the fallback when it refuses.
        const detail = await subjectDetail(file.kind, subject.id)
        const creator = detail?.creator || subject.creator
        const year = detail?.year || subject.year
        const url = subjectUrl(file.kind, subject.id)

        updates.set(item.title, [
          { key: CREATOR_KEY[file.kind], value: creator },
          { key: '年份', value: year ? String(year) : '' },
          { key: '豆瓣', value: url },
        ])

        // A cover already downloaded (or written by hand) is left alone.
        const cached = covers[key] && existsSync(path.resolve(root, 'public' + covers[key]))
        if (!item.cover && !cached) {
          const pic = detail?.cover || subject.pic || await posterFromPage(file.kind, url)
          const cover = pic ? await downloadCover({ ...item, kind: file.kind }, pic) : ''
          if (cover) {
            covers[key] = cover
            coversSaved += 1
          }
        }

        console.log(`  ✓ ${item.title}${creator ? ` / ${creator}` : ''}${year ? ` (${year})` : ''} -> ${url}`)
      }
      catch (error) {
        failed += 1
        console.log(`  x ${item.title}: ${error.message}`)
      }
    }

    if (!updates.size) continue
    const result = rewriteDocument(file.text, file.kind, updates)
    if (!result.changed.length) {
      console.log(`  = ${path.basename(file.file)}: nothing to add`)
      continue
    }
    await writeFile(file.file, result.text, 'utf8')
    filesUpdated += 1
    for (const { title, keys } of result.changed) console.log(`  + ${title}: ${keys.join('、')}`)
  }

  // Records whose cover lives on NetEase need no download, so count what the
  // cache gained rather than what was written to disk.
  const coversSaved = Object.keys(covers).length - coversBefore

  if (!only.length) {
    const now = await completeNow(musicCache, shelfFacts)
    filesUpdated += now.files
    failed += now.failed
  }

  for (const [file, data] of [[coverCachePath, covers], [musicCachePath, musicCache]]) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  }

  if (!failed && !filesUpdated && !coversSaved) {
    console.log(complete === considered
      ? 'Every shelf entry was already complete.'
      : 'Nothing to add: the Douban lookups found nothing new.')
    return
  }
  console.log(`\nDone: ${filesUpdated} file(s) updated, ${coversSaved} cover(s) recorded, ${failed} failed, ${considered} considered.`)
  if (failed) console.log('Entries that failed are unchanged; run again to retry.')
}

await main()
