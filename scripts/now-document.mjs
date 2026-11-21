/**
 * Complete the three entries in src/content/pages/now.md — the "最近" column —
 * the same way scripts/fetch-covers.mjs completes the shelf.
 *
 * The file's format is not the shelf's: each entry is a label line naming a
 * work (`在读：《城南旧事》`) and a credit line carrying the creator and the
 * work's page (`林海音 https://book.douban.com/subject/3057333/`). Two things
 * follow from that and from how the column renders:
 *
 * - A book or film already has its Douban page inline, so it needs no second
 *   `豆瓣：` line; a record's credit line holds its player address instead, so
 *   its Douban page is recorded on a line of its own.
 * - The year is written into the file for reference but the column does not
 *   show it, so it never reaches the page.
 *
 * Like the shelf, nothing written here overwrites what the author typed.
 */
// Both spellings, so an English "Recently" column is completed the same way
// a Chinese one is.
const LABEL_KIND = {
  在读: 'book', 在看: 'film', 在听: 'music',
  Reading: 'book', Watching: 'film', Listening: 'music',
}
// The key the reference lines are written with, per kind. A column in English
// gets `year:` / `douban:` so the file reads as one language.
const REFERENCE_KEYS = {
  zh: { year: '年份', douban: '豆瓣', link: '链接', name: '作者', colon: '：' },
  en: { year: 'year', douban: 'douban', link: 'link', name: 'author', colon: ': ' },
}
const LINK_RE = /https?:\/\/\S+/
// The lines this script adds for reference. They are not the credit line, even
// when an older run put one of them second.
// `年份：` / `year:`, `豆瓣：` / `douban:`, `链接：` / `link:` — either spelling.
const REFERENCE_RE = /^\s*(年份|豆瓣|链接|year|douban|link)\s*[：:]/i
// `在读：《城南旧事》` — or the same entry typed without the marks, which is
// completed with them rather than skipped as unreadable.
// The label is short in Chinese (在听) and longer in English (Listening), so
// the budget is on characters, not on a guess at the language.
const LABEL_RE = /^([^：:]{1,12})\s*[：:]\s*(?:《(.+)》|(.+?))\s*$/

/** A credit line: the creator, and the address the row opens, in that order. */
function creditLine(creator, url) {
  return [creator, url].map(value => String(value ?? '').trim()).filter(Boolean).join(' ')
}

/**
 * The entries of now.md: `{ kind, label, title, creator, url, start, lines }`,
 * where `start` is the entry's first line index. The example inside the
 * comment and the YAML front matter are not entries.
 */
export function nowEntriesOf(text) {
  const lines = text.split(/\r\n|\n/)
  const found = []
  let comment = false

  for (let i = 0; i < lines.length;) {
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
    const head = block[0].match(LABEL_RE)
    if (!head) continue
    const kind = LABEL_KIND[head[1].trim()]
    if (!kind) continue

    // The second line is the credit unless it is a reference line: an entry
    // that holds only `年份：` was written by a pass that predates the credit
    // line, and reading that as the creator would search Douban for an author
    // named `年份：2012`.
    const second = block[1] ?? ''
    const credit = REFERENCE_RE.test(second) ? '' : second
    found.push({
      start,
      kind,
      label: head[1].trim(),
      // The marks are the file's typography, not part of the name: an entry
      // typed `在听：城市` names the same record as `在听：《城市》`.
      title: (head[2] ?? head[3]).trim(),
      marked: head[2] !== undefined,
      creator: credit.replace(LINK_RE, '').trim(),
      url: credit.match(LINK_RE)?.[0] ?? '',
      lines: block,
    })
  }

  return found
}

/**
 * Whether an entry already holds everything `npm run covers` would write: a
 * credit line with the address its row opens, the reference `年份`, and — for a
 * record — the separate `豆瓣` line. An entry with only a year line is not
 * complete: that is what an older run left behind, and the column draws the
 * year as the entry's author until a credit line is put above it.
 *
 * `fetch-covers.mjs` asks this before any request, so a complete entry costs
 * nothing on a second run.
 */
export function isNowEntryComplete(entry) {
  // Without its marks the label line is not what the column's examples show,
  // and it is the one thing a run can still add to an otherwise full entry.
  if (!entry.marked) return false
  const credit = entry.lines[1] ?? ''
  if (!credit.trim() || REFERENCE_RE.test(credit)) return false
  const link = credit.match(LINK_RE)?.[0]
  if (!link) return false
  // The name is what the row draws beside the work. A credit line holding only
  // the address has no author, and a run has one more thing to write there.
  if (!credit.replace(LINK_RE, '').trim()) return false
  // A record's row opens the player, so its credit line has to carry the
  // NetEase address the shelf links to.
  if (entry.kind === 'music' && !/^https:\/\/music\.163\.com\//.test(link)) return false
  if (!entry.lines.some(line => /^\s*年份\s*[：:]/.test(line))) return false
  return entry.kind !== 'music' || entry.lines.some(line => /^\s*豆瓣\s*[：:]/.test(line))
}

/**
 * @param text  The file's contents.
 * @param items Map of entry title -> `{ kind, creator, year, douban, link }`.
 *              The credit line is filled from `creator` and the address, and
 *              a record's `link` replaces the address already there.
 * @returns The new contents and which entries changed, in file order.
 */
export function rewriteNow(text, items) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r\n|\n/)
  const changed = []

  // Last entry first: completing one inserts lines, which would shift the
  // indices of the entries after it.
  for (const entry of nowEntriesOf(text).reverse()) {
    const wanted = items.get(entry.title)
    if (!wanted) continue

    const block = [...entry.lines]
    const keys = []
    // The label line's marks are this file's typography. An entry typed
    // without them names the same work, so they are written rather than the
    // entry being skipped — or completed and left looking unlike its
    // neighbours.
    if (!entry.marked) {
      block[0] = `${entry.label}：《${entry.title}》`
      keys.push('名称')
    }
    // `match` returns null on a miss, and `null >= 0` is true — compare the
    // result explicitly, not with an ordering operator.
    const index = key => block.findIndex(line => line.match(new RegExp(`^\\s*${key}\\s*[：:]`)) !== null)
    const set = (key, value) => {
      const next = String(value ?? '').trim()
      if (!next) return
      const at = index(key)
      if (at >= 0) {
        // `年份` and `豆瓣` are reference lines: an existing one is kept.
        if (block[at].match(/[：:]\s*(.+?)\s*$/)[1].trim() === next) return
        if (key !== '链接') return
        block[at] = `${key}${spelling.colon}${next}`
        keys.push(key)
        return
      }
      block.push(`${key}${spelling.colon}${next}`)
      keys.push(key)
    }

    // Write in the spelling this file already uses, so an English column gains
    // `year:` and a Chinese one `年份：` — never a mix. The label line is the
    // clearest signal; a file with only reference lines is read from those.
    const spelling = /[一-龥]/.test(block[0]) || block.some(line => /^\s*(年份|豆瓣|链接)\s*[：:]/.test(line))
      ? REFERENCE_KEYS.zh
      : REFERENCE_KEYS.en

    // The credit line — the row's second line — carries the creator and the
    // address the row opens: a record's player, a book's or film's Douban page.
    // A label line on its own gets one; an entry that only has reference lines
    // gets one above them, so the column never draws the year as the author.
    const address = entry.kind === 'music' ? wanted.link : wanted.douban
    // What the address is called in this file's own words: a record's row opens
    // its player, a book's or film's opens its Douban page.
    const addressKey = entry.kind === 'music' ? spelling.link : spelling.douban
    const hasCredit = Boolean(block[1]?.trim()) && !REFERENCE_RE.test(block[1])
    if (!hasCredit) {
      const line = creditLine(wanted.creator, address)
      if (line) {
        block.splice(1, 0, line)
        keys.unshift(addressKey)
      }
    }
    else if (entry.kind === 'music') {
      // A record's row opens the player, so its address is replaced with the
      // one the shelf links to. A book's or film's address is the page the
      // author chose, and is left as they wrote it.
      const next = LINK_RE.test(block[1]) ? block[1].replace(LINK_RE, address) : creditLine(block[1], address)
      if (address && next !== block[1]) {
        block[1] = next
        keys.unshift(addressKey)
      }
      // The name the author typed stays; a credit line that is nothing but the
      // address gets the one the lookup found, before it.
      if (wanted.creator && !block[1].replace(LINK_RE, '').trim()) {
        block[1] = creditLine(wanted.creator, block[1])
        keys.unshift(spelling.name)
      }
    }
    else {
      // A credit line that is nothing but the address names no author, and the
      // column would draw an entry with no one's name on it. The name goes
      // before the address; a name already there is the author's own.
      const words = block[1].replace(LINK_RE, '').trim()
      if (wanted.creator && !words) {
        block[1] = creditLine(wanted.creator, block[1])
        keys.unshift(spelling.name)
      }
      else if (address && !LINK_RE.test(block[1])) {
        // Words without an address: the Douban page is added after them.
        block[1] = creditLine(block[1], address)
        keys.unshift(addressKey)
      }
    }

    set(spelling.year, wanted.year)
    // Only a record needs a separate Douban line; the others' credit line is
    // their Douban page already.
    if (entry.kind === 'music') set(spelling.douban, wanted.douban)

    if (!keys.length) continue
    lines.splice(entry.start, entry.lines.length, ...block)
    changed.push({ start: entry.start, title: entry.title, keys })
  }

  changed.sort((a, b) => a.start - b.start)
  return { text: lines.join(eol), changed: changed.map(({ title, keys }) => ({ title, keys })) }
}
