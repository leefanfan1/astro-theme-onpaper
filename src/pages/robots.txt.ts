import type { APIRoute } from 'astro'
import { siteConfig } from '@/config'

export const GET: APIRoute = () => {
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL('/sitemap-index.xml', siteConfig.url).href}
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}