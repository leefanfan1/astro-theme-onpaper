import type { APIRoute } from 'astro'
import { siteConfig } from '@/config'
import { renderOgImage } from '@/plugins/og-image.mjs'
import type { Post } from '@/utils/posts'
import { formatDate, getAllPosts, getPostDescription } from '@/utils/posts'

// /og/<slug>.png: the social image for each article, built from its title
// and the opening of its summary. See src/plugins/og-image.mjs.
const SUMMARY_CHARS = 60

const { light } = siteConfig.theme
const colors = {
  paper: light.paper,
  spine: light.surface,
  ink: light.ink,
  soft: light.inkSoft,
  faint: light.inkFaint,
  accent: light.accent,
  line: light.line,
}
const host = new URL(siteConfig.url).host

function cardOf(post: Post) {
  const description = getPostDescription(post, SUMMARY_CHARS + 20)
  const chars = [...description]
  const summary = chars.length > SUMMARY_CHARS ? `${chars.slice(0, SUMMARY_CHARS).join('').trim()}…` : description
  return { title: post.data.title, summary, date: formatDate(post.data.published), site: siteConfig.title, host, colors }
}

export async function getStaticPaths() {
  const posts = await getAllPosts()
  const cards = posts.map(cardOf)
  // One font subset serves every image in the build.
  const allText = cards.map(card => [card.site, card.title, card.summary, card.date, card.host].join('')).join('')
  return posts.map((post, index) => ({
    params: { slug: post.id },
    props: { card: cards[index], allText },
  }))
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgImage(props.card, props.allText)
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } })
}
