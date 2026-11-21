/**
 * Reading and editing one shelf entry — a paragraph of `键：值` lines in
 * src/content/shelf/*.md — without disturbing anything the author typed.
 *
 * `npm run covers` uses this to fill in the metadata Douban and the music
 * platforms can supply. It is deliberately conservative: a field the author
 * wrote is never overwritten (whatever Douban says the year is, 1960 stays
 * 1960); only an absent line is added, and it is added where the field order
 * in the file's own comment puts it.
 *
 * Kept out of fetch-covers.mjs so the rules can be tested without the network
 * (tests/shelf-metadata.mjs).
 */

/**
 * Every field a shelf entry can carry, in the two spellings it accepts.
 *
 * The theme's own files and everything this script writes are in Chinese,
 * which is right for the site the theme was made for. A shelf written in
 * English is just as valid — `year: 1960` means what `年份：1960` means — so
 * reading accepts either and writing follows whichever the block already uses.
 * `FIELD_ORDER` below is the Chinese order, and is what a Chinese block gets.
 */
export const FIELD_KEYS = {
  年份: ['年份', 'year'],
  豆瓣: ['豆瓣', 'douban'],
  封面: ['封面', 'cover'],
  一句话: ['一句话', 'note'],
  链接: ['链接', 'link', 'url'],
}

/** The English spelling to write when a block is written in English. */
export const FIELD_KEYS_EN = {
  年份: 'year',
  豆瓣: 'douban',
  封面: 'cover',
  一句话: 'note',
  链接: 'link',
}

/** The order a block's fields are written in, as documented in each file. */
export const FIELD_ORDER = {
  book: ['书名', '作者', '年份', '豆瓣', '封面', '一句话'],
  film: ['片名', '导演', '年份', '豆瓣', '封面', '一句话'],
  music: ['名称', '歌手', '年份', '链接', '豆瓣', '封面', '一句话'],
}

// The title and creator keys, which the order above names in Chinese.
const TITLE_AND_CREATOR = {
  book: { title: ['书名', 'title'], creator: ['作者', 'author'] },
  film: { title: ['片名', '电影', 'title'], creator: ['导演', '主演', 'director'] },
  music: { title: ['名称', '专辑', '歌曲', 'title'], creator: ['歌手', '作者', 'artist'] },
}

/**
 * Resolve any spelling of a field to the name `FIELD_ORDER` uses, so the
 * insert position is the same for an English block as for a Chinese one.
 */
export function canonicalKey(kind, name) {
  for (const [canonical, spellings] of Object.entries(spellingsOfAll(kind))) {
    if (spellings.includes(name)) return canonical
  }
  return name
}

/** Every spelling of one field, Chinese and English alike. */
export function spellingsOf(kind, canonical) {
  return spellingsOfAll(kind)[canonical] ?? [canonical]
}

function spellingsOfAll(kind) {
  const names = TITLE_AND_CREATOR[kind] ?? {}
  return {
    ...FIELD_KEYS,
    [FIELD_ORDER[kind]?.[0] ?? 'title']: names.title ?? [],
    [FIELD_ORDER[kind]?.[1] ?? 'author']: names.creator ?? [],
  }
}

/**
 * Which way round a block writes its keys: 'zh' for a block that has any CJK
 * key, 'en' for one written entirely in English. A block with no keys at all
 * yet — just a title, say — has nothing to go on, and gets Chinese, which is
 * what the theme's own files use.
 */
export function blockLanguage(fields) {
  for (const key of fields.keys()) {
    if (/[一-龥]/.test(key)) return 'zh'
  }
  return fields.size ? 'en' : 'zh'
}

/** The first of a field's spellings that the block actually uses. */
export function fieldValue(fields, canonical) {
  for (const key of FIELD_KEYS[canonical] ?? [canonical]) {
    const value = fields.get(key)
    if (value) return value
  }
  return ''
}

// The key each kind uses for its title; mirrors src/utils/shelf.ts.
const TITLE_KEYS = {
  book: ['书名', 'title'],
  film: ['片名', '电影', 'title'],
  music: ['名称', '专辑', '歌曲', 'title'],
}

const LINE_RE = /^(\s*([^：:]{1,8})\s*[：:]\s*)(.+?)(\s*)$/

/** The key a line declares, or '' when the line is not a field. */
export function keyOf(line) {
  return line.match(LINE_RE)?.[2].trim() ?? ''
}

/** One paragraph of a shelf file: its field map, and its raw lines. */
export function parseEntry(lines) {
  const fields = new Map()
  for (const line of lines) {
    const match = line.match(LINE_RE)
    if (match) fields.set(match[2].trim(), match[3].trim())
  }
  return {
    lines,
    fields,
    /** The title under whichever key this kind uses, or '' when absent. */
    title(kind) {
      for (const key of TITLE_KEYS[kind] ?? []) {
        const value = fields.get(key)
        if (value) return value
      }
      return ''
    },
  }
}

/**
 * Apply a list of `{ key, value, mode }` updates to a block.
 *
 * - `mode: 'insert'` (the default) adds the line only when the key is absent.
 * - `mode: 'set'` rewrites an existing value, keeping the author's spacing
 *   around the colon; it is a no-op when the value already matches.
 *
 * An empty or whitespace-only value is not a value: nothing is written.
 * Returns the resulting lines plus the keys that actually changed.
 */
export function updateEntry(lines, kind, updates) {
  const order = FIELD_ORDER[kind] ?? []
  const result = [...lines]
  const changed = []
  // Write in the spelling the block already uses. A block written in English
  // gains `year: 1999`, not `年份：1999` after its `title:` line.
  const lang = blockLanguage(parseEntry(result).fields)
  // How each field is spelled in the language this block writes.
  const ENGLISH_SPELLING = {
    年份: 'year', 豆瓣: 'douban', 封面: 'cover', 一句话: 'note', 链接: 'link',
    作者: 'author', 导演: 'director', 歌手: 'artist',
    书名: 'title', 片名: 'title', 名称: 'title',
  }
  const spelling = canonical => lang === 'en' ? (ENGLISH_SPELLING[canonical] ?? canonical) : canonical

  for (const { key, value, mode = 'insert' } of updates) {
    const next = String(value ?? '').trim()
    if (!next || !key) continue
    // A field the author wrote in either spelling already exists. The creator
    // and title keys live in TITLE_AND_CREATOR rather than FIELD_KEYS, so the
    // lookup goes through canonicalKey for all of them.
    const spellings = spellingsOf(kind, key)
    const index = result.findIndex(line => spellings.includes(keyOf(line)))
    const written = spelling(key)

    if (index >= 0) {
      if (mode !== 'set') continue
      const match = result[index].match(LINE_RE)
      // Keep the indentation, the colon the author used (full-width or not)
      // and the spacing after it; only the value is replaced.
      const rewritten = `${match[1]}${next}${match[4]}`
      if (rewritten === result[index]) continue
      result[index] = rewritten
      changed.push(written)
      continue
    }

    const at = insertionPoint(result, order, kind, key)
    // The colon follows the language too: full-width in Chinese copy, the
    // ASCII one in English, which is what a Markdown file in English expects.
    result.splice(at, 0, lang === 'en' ? `${written}: ${next}` : `${written}：${next}`)
    changed.push(written)
  }

  return { lines: result, changed }
}

/**
 * Where a missing field goes: before the first line that is either a known
 * field sorting later, or a field this kind does not know (so the block's
 * documented fields stay together, ahead of anything the author added).
 */
function insertionPoint(lines, order, kind, key) {
  const rank = order.indexOf(key)
  for (let i = 0; i < lines.length; i++) {
    const existing = keyOf(lines[i])
    if (!existing) continue
    const existingRank = order.indexOf(canonicalKey(kind, existing))
    if (existingRank < 0 || existingRank > rank) return i
  }
  return lines.length
}
