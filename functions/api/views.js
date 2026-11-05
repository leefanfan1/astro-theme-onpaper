/**
 * Cloudflare Pages Function — optional KV-backed view counter.
 *
 * Bind a KV namespace named VIEWS_KV in the Pages project (Settings → Functions
 * → KV namespace bindings). Without the binding, the endpoint returns 503 and
 * the article page simply hides the counter.
 *
 * The site itself stays fully static: this is the only dynamic route.
 */

const MAX_SLUG_LENGTH = 100
const SLUG_PATTERN = /^[\w-]+$/

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug')

  if (!slug) {
    return json({ error: 'Missing slug parameter' }, 400)
  }

  if (slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    return json({ error: 'Invalid slug parameter' }, 400)
  }

  if (!env.VIEWS_KV) {
    return json({ error: 'Views KV binding is not configured' }, 503)
  }

  const key = `views:${slug}`

  if (request.method === 'GET') {
    const count = Number.parseInt(await env.VIEWS_KV.get(key), 10) || 0
    return json({ views: count })
  }

  if (request.method === 'POST') {
    let count = Number.parseInt(await env.VIEWS_KV.get(key), 10) || 0
    count += 1
    await env.VIEWS_KV.put(key, String(count))
    return json({ views: count })
  }

  return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' })
}