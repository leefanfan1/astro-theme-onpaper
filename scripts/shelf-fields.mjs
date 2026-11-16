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

/** The order a block's fields are written in, as documented in each file. */
export const FIELD_ORDER = {
  book: ['书名', '作者', '年份', '豆瓣', '封面', '一句话'],
  film: ['片名', '导演', '年份', '豆瓣', '封面', '一句话'],
  music: ['名称', '歌手', '年份', '链接', '豆瓣', '封面', '一句话'],
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

  for (const { key, value, mode = 'insert' } of updates) {
    const next = String(value ?? '').trim()
    if (!next || !key) continue
    const index = result.findIndex(line => keyOf(line) === key)

    if (index >= 0) {
      if (mode !== 'set') continue
      const match = result[index].match(LINE_RE)
      // Keep the indentation, the colon the author used (full-width or not)
      // and the spacing after it; only the value is replaced.
      const rewritten = `${match[1]}${next}${match[4]}`
      if (rewritten === result[index]) continue
      result[index] = rewritten
      changed.push(key)
      continue
    }

    const at = insertionPoint(result, order, key)
    result.splice(at, 0, `${key}：${next}`)
    changed.push(key)
  }

  return { lines: result, changed }
}

/**
 * Where a missing field goes: before the first line that is either a known
 * field sorting later, or a field this kind does not know (so the block's
 * documented fields stay together, ahead of anything the author added).
 */
function insertionPoint(lines, order, key) {
  const rank = order.indexOf(key)
  for (let i = 0; i < lines.length; i++) {
    const existing = keyOf(lines[i])
    if (!existing) continue
    const existingRank = order.indexOf(existing)
    if (existingRank < 0 || existingRank > rank) return i
  }
  return lines.length
}
