/**
 * Douban lookups for one shelf entry: find the subject page, then read the
 * author / director / singer, the year and the cover off it.
 *
 * Three endpoints are involved, because none of them is enough alone:
 *
 * - `subject_suggest` is fast and gives title, year, creator and poster, but
 *   it rate-limits (answering `[]`) and has no music index.
 * - `subject_search` renders its results into `window.__DATA__`. It works for
 *   all three kinds, including music, and carries the year inside `abstract`.
 * - `m.douban.com/rexxar/api/v2/{book,movie,music}/<id>` is the mobile app's
 *   JSON and is the only one that separates creator and publication date
 *   properly. The desktop subject page redirects an anonymous request.
 *
 * Nothing here trusts a URL it did not get from douban.com itself.
 */
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const TIMEOUT = 15000

const HOST = { book: 'book.douban.com', film: 'movie.douban.com', music: 'music.douban.com' }
// The mobile API spells a film `movie`, everywhere else in this theme it is a
// `film`; passing the shelf's word straight into the URL 404s.
const REXXAR = { book: 'book', film: 'movie', music: 'music' }

async function get(url, headers) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA_DESKTOP, ...headers },
      redirect: 'error',
      signal: controller.signal,
    })
  }
  finally { clearTimeout(timer) }
}

/** The numeric id in a subject URL, or '' when the URL is not one. */
export function subjectId(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !Object.values(HOST).includes(url.hostname)) return ''
    return url.pathname.match(/^\/subject\/(\d+)\/?$/)?.[1] ?? ''
  }
  catch { return '' }
}

/** A subject's canonical page, built from the id so nothing else is trusted. */
export function subjectUrl(kind, id) {
  return `https://${HOST[kind]}/subject/${id}/`
}

/** `2009-05-22`, `2011-1`, `2000` -> 2009, 2011, 2000. */
export function yearOf(value) {
  const match = String(value ?? '').match(/(?:19|20)\d{2}/)
  return match ? Number(match[0]) : 0
}

/** "城市 / The City", "花样年华 花样年华 (2000)" -> the searchable name. */
function bareTitle(value) {
  return String(value ?? '')
    .replace(/‎/g, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .split(/\s+\/\s+/)[0]
    .trim()
}

/** Suggest-API hit -> the shape the rest of this file speaks. */
function fromSuggest(kind, hit) {
  return {
    id: String(hit.id ?? subjectId(hit.url ?? '')),
    title: bareTitle(hit.title),
    year: yearOf(hit.year),
    creator: String(hit.author_name ?? ''),
    pic: typeof hit.pic === 'string' ? hit.pic : typeof hit.img === 'string' ? hit.img : '',
    kind,
  }
}

/**
 * Search-page hit. `abstract` reads "张悬 / 2009-05-22 / 专辑 / CD / 摇滚"
 * for music and "是枝裕和 / 2015 / …" for films, so the segment before the
 * year is the creator.
 */
function fromSearch(kind, hit) {
  const parts = String(hit.abstract ?? '').split('/').map(part => part.trim())
  const yearAt = parts.findIndex(part => /^(?:19|20)\d{2}/.test(part))
  return {
    id: String(hit.id ?? ''),
    title: bareTitle(hit.title),
    year: yearAt >= 0 ? yearOf(parts[yearAt]) : 0,
    creator: yearAt > 0 ? parts[0] : '',
    pic: typeof hit.cover_url === 'string' ? hit.cover_url : '',
    kind,
  }
}

/**
 * The JSON behind `window.__DATA__ = {…}` on a subject_search page. Scanned
 * rather than regex-matched: the object is inline JavaScript whose strings
 * contain braces.
 */
function embeddedData(html) {
  const marker = html.indexOf('window.__DATA__')
  if (marker < 0) return null
  const start = html.indexOf('{', marker)
  if (start < 0) return null
  let depth = 0
  let quoted = false
  let escaped = false
  for (let i = start; i < html.length; i++) {
    const char = html[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)) }
        catch { return null }
      }
    }
  }
  return null
}

async function searchPage(kind, query) {
  const url = `https://${HOST[kind]}/subject_search?search_text=${encodeURIComponent(query)}`
  try {
    const response = await get(url, { Referer: `https://${HOST[kind]}/` })
    if (!response.ok) return []
    const data = embeddedData(await response.text())
    return (data?.items ?? [])
      .filter(item => typeof item.url === 'string' && subjectId(item.url))
      .map(item => fromSearch(kind, { ...item, id: subjectId(item.url) }))
  }
  catch { return [] }
}

async function suggest(kind, query) {
  if (kind === 'music') return [] // No music index on this endpoint.
  const endpoint = `https://${HOST[kind]}/j/subject_suggest?q=`
  try {
    const response = await get(endpoint + encodeURIComponent(query), { Referer: `https://${HOST[kind]}/` })
    if (!response.ok) return []
    const hits = await response.json()
    return Array.isArray(hits) ? hits.map(hit => fromSuggest(kind, hit)).filter(hit => hit.id) : []
  }
  catch { return [] }
}

/**
 * The best hit for an entry. A hit with nothing going for it is not a match:
 * a wrong subject would put the wrong author and the wrong cover on a book,
 * and the author reviews that diff.
 */
function choose(candidates, { title, creator, year }) {
  const wanted = bareTitle(title)
  const scored = candidates.map(candidate => {
    let score = 0
    if (candidate.title === wanted) score += 5
    else if (candidate.title.includes(wanted) || wanted.includes(candidate.title)) score += 3
    if (year && candidate.year === Number(year)) score += 4
    const agrees = creator && candidate.creator
      && (candidate.creator.includes(creator) || creator.includes(candidate.creator))
    if (agrees) score += 4
    if (candidate.pic) score += 1
    return { candidate, score, agrees }
  })
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.score < 5) return null
  // When the entry names a creator, a title that is not identical is only
  // enough if the creator confirmed it — two books can share a title.
  if (creator && best.candidate.title !== wanted && !best.agrees) return null
  return best.candidate
}

/**
 * The subject for one entry: the page the entry already names, or the best
 * search hit. Returns null when nothing matches well enough to be written
 * into the author's file.
 */
export async function findSubject(kind, { title, creator, year, url }) {
  const named = subjectId(url ?? '')
  if (named) return { id: named, kind, title: bareTitle(title), year: yearOf(year), creator, pic: '' }

  const query = [title, creator].filter(Boolean).join(' ')
  if (!query) return null
  const candidates = [...await suggest(kind, query), ...await searchPage(kind, query)]
  // A hit both endpoints return is one candidate, with the better half of
  // each answer.
  const merged = new Map()
  for (const candidate of candidates) {
    const known = merged.get(candidate.id)
    merged.set(candidate.id, known
      ? {
          ...known,
          title: known.title || candidate.title,
          year: known.year || candidate.year,
          creator: known.creator || candidate.creator,
          pic: known.pic || candidate.pic,
        }
      : candidate)
  }
  return choose([...merged.values()], { title, creator, year })
}

/**
 * Author / director / singer, year and cover from the mobile-subject JSON.
 * Returns null when the endpoint refuses (it answers `need_login` at times).
 */
export async function subjectDetail(kind, id) {
  if (!/^\d+$/.test(String(id))) return null
  try {
    const response = await get(`https://m.douban.com/rexxar/api/v2/${REXXAR[kind]}/${id}?for_mobile=1`, {
      'User-Agent': UA_MOBILE,
      Referer: `https://m.douban.com/${REXXAR[kind]}/`,
      Accept: 'application/json',
    })
    if (!response.ok) return null
    const data = await response.json()
    const creator = kind === 'book'
      ? (data.author ?? [])[0]
      : kind === 'film'
        ? data.directors?.[0]?.name
        : data.singer?.[0]?.name
    return {
      id: String(id),
      title: bareTitle(data.title),
      creator: String(creator ?? ''),
      // Films carry a bare `year`; books and records carry `pubdate` lists
      // ("2011-1", "2009-05-22").
      year: yearOf(data.year || (data.pubdate ?? [])[0] || ''),
      cover: typeof data.pic?.large === 'string' ? data.pic.large : '',
    }
  }
  catch { return null }
}

/** Last resort for a cover: the poster on the entry's own subject page. */
export async function posterFromPage(kind, url) {
  const id = subjectId(url ?? '')
  if (!id) return ''
  try {
    const response = await get(`https://m.douban.com/${REXXAR[kind]}/subject/${id}/`, {
      'User-Agent': UA_MOBILE,
      Referer: `https://${HOST[kind]}/`,
    })
    if (!response.ok) return ''
    const html = await response.text()
    const poster = html.match(/https:\/\/img\d+\.doubanio\.com\/view\/photo\/[^"'\s]+/)
    return poster ? poster[0].replaceAll('\\/', '/') : ''
  }
  catch { return '' }
}
