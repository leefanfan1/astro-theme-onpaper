import type { APIRoute } from 'astro'
import { siteConfig } from '@/config'
import { escapeXml, getAllPosts, getPostDescription, getPostHref } from '@/utils/posts'

export const GET: APIRoute = async () => {
  const posts = await getAllPosts()
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const now = new Date().toUTCString()

  const items = posts.map((post) => {
    const url = new URL(`${base}${getPostHref(post)}`, siteConfig.url).href
    return `<item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(getPostDescription(post, 200))}</description>
      <pubDate>${post.data.published.toUTCString()}</pubDate>
      ${post.data.tags.map(tag => `<category>${escapeXml(tag)}</category>`).join('')}
    </item>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.title)}</title>
    <link>${escapeXml(siteConfig.url)}</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${escapeXml(new URL('/rss.xml', siteConfig.url).href)}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}