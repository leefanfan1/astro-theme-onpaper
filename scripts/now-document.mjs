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
const LABEL_KIND = { 在读: 'book', 在看: 'film', 在听: 'music' }
const LINK_RE = /https?:\/\/\S+/

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
    const head = block[0].match(/^([^：:]{1,4})\s*[：:]\s*《(.+)》\s*$/)
    if (!head) continue
    const kind = LABEL_KIND[head[1].trim()]
    if (!kind) continue

    const credit = block[1] ?? ''
    found.push({
      start,
      kind,
      label: head[1].trim(),
      title: head[2].trim(),
      creator: credit.replace(LINK_RE, '').trim(),
      url: credit.match(LINK_RE)?.[0] ?? '',
      lines: block,
    })
  }

  return found
}

/**
 * @param text  The file's contents.
 * @param items Map of entry title -> `{ kind, creator, year, douban, link }`.
 *              `link` replaces the address on a record's credit line.
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
        block[at] = `${key}：${next}`
        keys.push(key)
        return
      }
      block.push(`${key}：${next}`)
      keys.push(key)
    }

    // A record's credit line carries its player address, and the column opens
    // exactly that; the shelf's `链接` is the same thing.
    if (entry.kind === 'music' && wanted.link && block[1] && LINK_RE.test(block[1])) {
      const next = block[1].replace(LINK_RE, wanted.link)
      if (next !== block[1]) {
        block[1] = next
        keys.unshift('链接')
      }
    }

    set('年份', wanted.year)
    // Only a record needs a separate Douban line; the others' credit line is
    // their Douban page already.
    if (entry.kind === 'music') set('豆瓣', wanted.douban)

    if (!keys.length) continue
    lines.splice(entry.start, entry.lines.length, ...block)
    changed.push({ start: entry.start, title: entry.title, keys })
  }

  changed.sort((a, b) => a.start - b.start)
  return { text: lines.join(eol), changed: changed.map(({ title, keys }) => ({ title, keys })) }
}
