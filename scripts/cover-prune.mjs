/**
 * What a run of `npm run covers` may delete.
 *
 * The script only ever added, so a book deleted from books.md left its image in
 * public/shelf/ and its line in src/data/shelf-covers.json forever. Deciding
 * what to remove is pure — a list of live entries, a cache, and the files on
 * disk — so it lives here and is tested without touching either.
 *
 * The rules are deliberately narrow. This deletes files, so it only ever
 * removes a name it generates itself, only when nothing on the shelf names it,
 * and never anything at all when the live list is not trustworthy.
 */

/** The file name this script generates for a shelf cover, and only that. */
const GENERATED = /^[a-f0-9]{12}\.jpg$/
/** What `npm run music` saves a card's cover as. */
const GENERATED_MUSIC = /^[a-f0-9]{12}\.jpg$/

/**
 * @param complete  Whether every shelf file was read. False means the live
 *                  entry list is partial, so nothing may be removed.
 * @param reason    Why it is incomplete, for the log.
 * @param entries   The entries the shelf files hold: `{ kind, title, cover }`,
 *                  where `cover` is a path the author wrote, if any.
 * @param covers    src/data/shelf-covers.json, verbatim.
 * @param files     The file names present in public/shelf/ (no directory).
 * @returns `{ covers, remove, dropped, kept, skipped }` — the cache to write,
 *          the file names to delete, what was dropped from the cache, file names
 *          left alone because the script did not generate them, and, when the
 *          run was incomplete, the reason it removed nothing.
 */
export function planShelfPrune({ complete, reason = '', entries = [], covers = {}, files = [] }) {
  if (!complete) {
    return { covers, remove: [], dropped: [], kept: [], skipped: reason }
  }

  // A cover is referenced when the entry it belongs to is still on the shelf —
  // through the cache line this script wrote, or through a 封面： line the
  // author wrote, which the cache never holds.
  const live = new Set(entries.map(entry => `${entry.kind}:${entry.title}`))
  const nextCovers = {}
  const dropped = []
  for (const [key, cover] of Object.entries(covers)) {
    if (live.has(key)) nextCovers[key] = cover
    else dropped.push({ key, cover })
  }

  const referenced = new Set([
    ...Object.values(nextCovers),
    ...entries.map(entry => entry.cover),
  ].filter(value => /^\/shelf\/[^/]+$/.test(String(value ?? ''))).map(value => value.slice('/shelf/'.length)))

  const remove = []
  const kept = []
  for (const file of files) {
    if (!GENERATED.test(file)) {
      kept.push(file)
      continue
    }
    if (!referenced.has(file)) remove.push(file)
  }

  return { covers: nextCovers, remove: remove.sort(), dropped, kept, skipped: '' }
}

/**
 * The same question for the cards' covers.
 *
 * What keeps a file is a URL some post still writes in `::music{...}` — the
 * cache holds entries for URLs that were deleted from the Markdown long ago,
 * and for records on the shelf, so the cache is not the live list. The cache
 * lines themselves are left alone: `fetch-covers.mjs` reads them for records,
 * and an entry costs nothing while nothing references its file.
 *
 * @param urls    The `::music` URLs still in src/content, or null when the
 *                content folder could not be read.
 * @param reason  Why the list is untrustworthy, for the log.
 * @param cache   src/data/music-cache.json, verbatim.
 * @param files   The file names present in public/music/ (no directory).
 */
export function planMusicPrune({ urls, reason = '', cache = {}, files = [] }) {
  if (!Array.isArray(urls)) {
    return { remove: [], skipped: reason || 'src/content could not be read' }
  }
  const referenced = new Set(
    urls
      .map(url => String(cache?.[url]?.coverFile ?? ''))
      .filter(value => /^\/music\/[^/]+$/.test(value))
      .map(value => value.slice('/music/'.length)),
  )
  // Only this script's own names are its to delete.
  return {
    remove: files.filter(file => GENERATED_MUSIC.test(file) && !referenced.has(file)).sort(),
    skipped: '',
  }
}
