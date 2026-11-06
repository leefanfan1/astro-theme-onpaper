import type { CollectionEntry } from 'astro:content'
import { getCollection } from 'astro:content'
import { siteConfig } from '@/config'
import { decodeHtmlEntities } from '@/utils/html-entities'

export type Post = CollectionEntry<'posts'>

const zhCollator = new Intl.Collator('zh-CN')

function byDateDesc(a: Post, b: Post) {
  return b.data.published.getTime() - a.data.published.getTime()
}

/** 只返回当前环境可见的文章：开发时包含草稿，构建时排除。 */
export async function getAllPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft)
  return posts.sort(byDateDesc)
}

export async function getPinnedPosts(posts?: Post[]): Promise<Post[]> {
  const all = posts ?? (await getAllPosts())
  return all
    .filter(post => post.data.pin > 0)
    .sort((a, b) => b.data.pin - a.data.pin || byDateDesc(a, b))
}

export async function getRegularPosts(posts?: Post[]): Promise<Post[]> {
  const all = posts ?? (await getAllPosts())
  return all.filter(post => post.data.pin === 0).sort(byDateDesc)
}

export function getTotalPages(totalItems: number, perPage = siteConfig.postsPerPage): number {
  return Math.max(1, Math.ceil(totalItems / perPage))
}

export function paginate<T>(items: T[], page: number, perPage = siteConfig.postsPerPage): T[] {
  return items.slice((page - 1) * perPage, page * perPage)
}

export function groupByYear(posts: Post[]): Array<[number, Post[]]> {
  const groups = new Map<number, Post[]>()
  for (const post of posts) {
    const year = post.data.published.getUTCFullYear()
    const list = groups.get(year) ?? []
    list.push(post)
    groups.set(year, list)
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0])
}

export function getAllTags(posts: Post[]): Array<{ tag: string, count: number }> {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || zhCollator.compare(a.tag, b.tag))
}

export function getPostsByTag(posts: Post[], tag: string): Post[] {
  return posts.filter(post => post.data.tags.includes(tag)).sort(byDateDesc)
}

export function getPostHref(post: Post): string {
  return `/posts/${post.id}/`
}

export function getTagHref(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`
}

export function stripMarkdown(markdown: string): string {
  const cleaned = markdown
    // Code blocks and inline code.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    // HTML comments and blocks whose text should never become excerpt text.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<![^>]*>/g, ' ')
    // Images (inline and reference style).
    .replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g, ' ')
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ')
    // Links (inline and reference style), keeping the visible label.
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    // Footnotes and remark directives.
    .replace(/\[\^[^\]]+\]/g, ' ')
    .replace(/:::[a-z-]+\{[^}]*\}/g, ' ')
    // Remaining HTML tags. Quoted attribute values may contain ">".
    .replace(/<\/?[a-z][a-z0-9:-]*(?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/gi, ' ')

  // Decode entities before Markdown's `#` / `*` markers are stripped.
  return decodeHtmlEntities(cleaned)
    // Markdown block markers: task lists, lists, blockquotes, rules, table separators.
    .replace(/^[ \t]{0,3}[-+*]\s+\[[ xX]\]\s+/gm, ' ')
    .replace(/^[ \t]{0,3}(?:[-+*]|\d+[.)])\s+/gm, ' ')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, ' ')
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm, ' ')
    .replace(/^[ \t]{0,3}=+[ \t]*$/gm, ' ')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm, ' ')
    // Remaining emphasis / table / heading markers.
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Description for meta tags, JSON-LD, RSS and search.
 * Uses the author-provided description, otherwise an excerpt of the body.
 */
export function getPostDescription(post: Post, maxLength = 160): string {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
  const explicit = normalize(decodeHtmlEntities(post.data.description))
  if (explicit) return explicit

  const body = normalize(stripMarkdown(post.body ?? ''))
  if (!body) return ''
  return body.length > maxLength ? `${body.slice(0, maxLength).trim()}…` : body
}

export function formatDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

export function formatDateLong(date: Date): string {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  const d = date.getUTCDate()
  return `${y} 年 ${m} 月 ${d} 日`
}

export function formatMonthDay(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${m}.${d}`
}

export function formatYear(date: Date): string {
  return String(date.getUTCFullYear())
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}