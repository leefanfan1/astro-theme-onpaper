import type { APIRoute } from 'astro'
import {
  formatDate,
  getAllPosts,
  getPostHref,
  stripMarkdown,
} from '@/utils/posts'

export const GET: APIRoute = async () => {
  const posts = await getAllPosts()
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')

  const index = posts.map((post) => {
    const content = stripMarkdown(post.body ?? '')
    return {
      title: post.data.title,
      description: post.data.description || content.slice(0, 160),
      tags: post.data.tags,
      date: formatDate(post.data.published),
      url: `${base}${getPostHref(post)}`,
      // Keep the index small enough to fetch lazily in one request.
      content: content.slice(0, 3000),
    }
  })

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}