/**
 * Rewrite a whole shelf Markdown file: complete the entries it can, leave
 * everything else alone.
 *
 * The three shelf files are hand-written and committed, and their opening
 * `<!-- -->` comment contains a full example entry — so "turn every `键：值`
 * paragraph into a record" would edit the documentation as well as the list.
 * Only the paragraphs outside comments and away from headings are entries.
 *
 * The line endings follow the file as it already is: books.md and films.md are
 * CRLF on this author's machine, music.md is LF.
 */
import { parseEntry, updateEntry } from './shelf-fields.mjs'

/**
 * The entry paragraphs of a shelf file, as `{ start, lines }`, where `start`
 * is the paragraph's first line index. A paragraph is a run of non-blank lines
 * outside comments; the heading at the top is a paragraph too, and is skipped
 * by asking for a title.
 */
export function entriesOf(text, kind) {
  const lines = text.split(/\r\n|\n/)
  const found = []
  let comment = false

  for (let i = 0; i < lines.length;) {
    // Comments are documentation, not entries; they also hold examples.
    if (comment) {
      if (lines[i].includes('-->')) comment = false
      i += 1
      continue
    }
    if (lines[i].includes('<!--')) {
      if (!lines[i].includes('-->')) comment = true
      i += 1
      continue
    }
    if (!lines[i].trim()) {
      i += 1
      continue
    }

    const start = i
    while (i < lines.length && lines[i].trim()) i += 1
    const block = lines.slice(start, i)
    if (/^#{1,6}\s/.test(block[0])) continue
    if (!parseEntry(block).title(kind)) continue
    found.push({ start, lines: block })
  }

  return found
}

/**
 * @param text    The file's contents.
 * @param kind    'book' | 'film' | 'music'.
 * @param updates Map of entry title -> `{ key, value, mode }` updates.
 * @returns The new contents and which entries actually changed.
 */
export function rewriteDocument(text, kind, updates) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r\n|\n/)
  const changed = []

  // Last entry first: completing one inserts lines, which would shift every
  // index `entriesOf` reported for the entries after it.
  for (const { start, lines: block } of entriesOf(text, kind).reverse()) {
    const title = parseEntry(block).title(kind)
    const entryUpdates = updates.get(title)
    if (!entryUpdates?.length) continue
    const result = updateEntry(block, kind, entryUpdates)
    if (!result.changed.length) continue
    lines.splice(start, block.length, ...result.lines)
    changed.push({ start, title, keys: result.changed })
  }

  // Reported in the file's own order, not the order they were written in.
  changed.sort((a, b) => a.start - b.start)
  return { text: lines.join(eol), changed: changed.map(({ title, keys }) => ({ title, keys })) }
}
