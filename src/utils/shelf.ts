/**
 * The shelf (books / films / music) and the home page's 最近 list, read from
 * Markdown the author edits by hand:
 *
 *   src/content/shelf/books.md
 *   src/content/shelf/films.md
 *   src/content/shelf/music.md
 *   src/content/pages/now.md
 *
 * Each shelf entry is one paragraph of `键：值` lines, so adding a book means
 * typing a few lines in a text editor — no rebuild config, no JSON to quote.
 * Everything here runs at build time; nothing ships to the browser.
 */
import type { Post } from '@/utils/posts'

export type ShelfKind = 'book' | 'film' | 'music'

export interface ShelfItem {
  kind: ShelfKind
  title: string
  creator: string
  year?: number
  note?: string
  /** The作品's own page (Douban for books and films, a music platform for records). */
  url?: string
  cover?: string
  /** Set when an article on this site mentions the work. */
  mention?: { href: string, post: string, section?: string }
}

// The key each kind uses for its title, as written in the Markdown.
const TITLE_KEYS: Record<ShelfKind, string[]> = {
  book: ['书名', 'title'],
  film: ['片名', '电影', 'title'],
  music: ['名称', '专辑', '歌曲', 'title'],
}
const CREATOR_KEYS: Record<ShelfKind, string[]> = {
  book: ['作者', 'author'],
  film: ['导演', '主演', 'director'],
  music: ['歌手', '作者', 'artist'],
}

/**
 * Only http(s) links become hrefs. A shelf line is hand-written Markdown, and
 * `javascript:` there would run in the reader's page — the same reason
 * friends.ts validates its URLs rather than trusting the file.
 */
function httpUrl(value: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  }
  catch {
    return null
  }
}

/** `键：值` (or `键: 值`) per line; blank lines separate entries. */
export function parseShelf(content: string, kind: ShelfKind): ShelfItem[] {
  const text = content
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#\s+.*$/gm, '')
  const entries = text.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)

  const pick = (fields: Map<string, string>, keys: string[]) => {
    for (const key of keys) {
      const value = fields.get(key)
      if (value) return value
    }
    return ''
  }

  const items: ShelfItem[] = []
  entries.forEach((block, index) => {
    const fields = new Map<string, string>()
    for (const line of block.split('\n')) {
      const match = line.match(/^\s*([^：:]{1,8})\s*[：:]\s*(.+?)\s*$/)
      if (match) fields.set(match[1].trim(), match[2].trim())
    }
    const title = pick(fields, TITLE_KEYS[kind])
    if (!title) {
      if (fields.size) console.warn(`[shelf] ${kind}.md 第 ${index + 1} 段缺少「${TITLE_KEYS[kind][0]}：」一行，已跳过。`)
      return
    }
    const year = Number(fields.get('年份') ?? fields.get('year') ?? '')
    items.push({
      kind,
      title,
      creator: pick(fields, CREATOR_KEYS[kind]),
      ...(Number.isFinite(year) && year > 0 ? { year } : {}),
      ...(fields.get('一句话') ? { note: fields.get('一句话')! } : {}),
      ...(httpUrl(fields.get('豆瓣') || fields.get('链接') || fields.get('url') || '')
        ? { url: httpUrl(fields.get('豆瓣') || fields.get('链接') || fields.get('url') || '')! }
        : {}),
      ...(fields.get('封面') ? { cover: fields.get('封面')! } : {}),
    })
  })
  return items
}

export interface NowEntry {
  label: string
  title: string
  creator: string
  /** Where the entry links: a music platform for 在听, Douban for the rest. */
  url?: string
  /** The work's Douban page, when the line names one separately. */
  douban?: string
}

/** `在听：《城市》` / `张悬 https://…` — one label line, one credit line. */
export function parseNow(content: string): NowEntry[] {
  const text = content
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#\s+.*$/gm, '')
  const entries: NowEntry[] = []
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    if (!lines.length) continue
    const head = lines[0].match(/^([^：:]{1,4})\s*[：:]\s*(.+)$/)
    if (!head) continue
    const credit = lines[1] ?? ''
    // One link on the credit line is the work's own page; a separate
    // `豆瓣：` line lets a record point at both its player and Douban.
    const links = [...lines.join(' ').matchAll(/https?:\/\/\S+/g)].map(match => match[0])
    const douban = httpUrl(lines.slice(2).find(line => /^豆瓣\s*[：:]/.test(line))?.replace(/^豆瓣\s*[：:]\s*/, '') ?? '') ?? ''
    entries.push({
      label: head[1].trim(),
      title: head[2].trim(),
      creator: credit.replace(/https?:\/\/\S+/, '').trim(),
      ...(links[0] ? { url: links[0] } : {}),
      ...(douban ? { douban } : {}),
    })
  }
  return entries
}

export interface Section {
  /** Line in the Markdown body where the heading sits. */
  line: number
  text: string
  /** The id rehype-slug gave it, as used by the rendered page. */
  slug: string
}

/**
 * Pair each heading with the line it starts on and the id its rendered page
 * uses. `slugs` comes from Astro's `render()`, so the anchor is the real one
 * rather than a second guess at the slugging rules.
 */
export function sectionsOf(markdown: string, slugs: Array<{ depth: number, slug: string, text: string }>): Section[] {
  const found: Section[] = []
  let fence = false
  let next = 0
  markdown.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) return
    if (!/^#{1,6}\s+/.test(line)) return
    const slug = slugs[next++]
    if (slug) found.push({ line: index, text: slug.text, slug: slug.slug })
  })
  return found
}

/** Body text with fenced code, inline code and HTML comments blanked out. */
function stripNonProse(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' '))
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1[^\n]*$/gm, match => match.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, match => ' '.repeat(match.length))
}

/**
 * Where each shelf item is written about, if anywhere: the first article that
 * names it, linked to the section it is named under.
 */
export function findMentions(
  items: ShelfItem[],
  posts: Array<{ id: string, title: string, body: string, sections: Section[] }>,
) {
  // Only running text counts: fenced code, inline code and comment blocks
  // mention titles as examples (this theme's own documentation does), and a
  // hit there would send a reader to a syntax sample instead of a review.
  const prepared = posts.map(post => ({ ...post, lines: stripNonProse(post.body).split('\n') }))

  for (const item of items) {
    // A one-character title would match too much running text; those fall
    // back to the work's own page.
    const needle = item.title.trim()
    if (needle.length < 2) continue
    for (const post of prepared) {
      const index = post.lines.findIndex(line => line.includes(needle))
      if (index < 0) continue
      const section = [...post.sections].reverse().find(heading => heading.line <= index)
      item.mention = {
        href: `/posts/${post.id}/${section ? `#${encodeURIComponent(section.slug)}` : ''}`,
        post: post.title,
        ...(section ? { section: section.text } : {}),
      }
      break
    }
  }
  return items
}

/** Read the three shelf files and attach where each work is written about. */
export async function loadShelf(posts: Post[]): Promise<Record<ShelfKind, ShelfItem[]>> {
  const { getCollection, render } = await import('astro:content')
  const entries = await getCollection('shelf')
  const body = (id: string) => entries.find(entry => entry.id === id)?.body ?? ''

  // Only pages that already render their headings can be anchored to, so the
  // heading ids come from the same renderer the article uses.
  const rendered = await Promise.all(posts.map(async post => {
    const { headings } = await render(post)
    return {
      id: post.id,
      title: post.data.title,
      body: post.body ?? '',
      sections: sectionsOf(post.body ?? '', headings),
    }
  }))

  const books = findMentions(parseShelf(body('books'), 'book'), rendered)
  const films = findMentions(parseShelf(body('films'), 'film'), rendered)
  const music = findMentions(parseShelf(body('music'), 'music'), rendered)
  return { book: books, film: films, music }
}

