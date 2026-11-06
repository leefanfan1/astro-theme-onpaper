/**
 * Cloudflare Pages Function — optional KV-backed view counter.
 *
 * Bind a KV namespace named VIEWS_KV in the Pages project (Settings → Functions
 * → KV namespace bindings). Without the binding, the endpoint returns 503 and
 * the article page simply hides the counter.
 *
 * The site itself stays fully static: this is the only dynamic route.
 */

const MAX_SLUG_LENGTH = 96
// Post slugs are lowercase ASCII. Restricting the key shape prevents arbitrary
// KV keys and keeps the counter from being used as a general-purpose store.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' })
  }

  const url = new URL(request.url)

  // Browsers send Sec-Fetch-Site/Origin on cross-site fetches. Reject obvious
  // cross-site increments; this is not a substitute for Cloudflare WAF rate
  // limiting, but it stops casual third-party abuse.
  if (request.method === 'POST') {
    const fetchSite = request.headers.get('Sec-Fetch-Site')
    const origin = request.headers.get('Origin')
    if (fetchSite === 'cross-site' || (origin && origin !== url.origin)) {
      return json({ error: 'Cross-site increment rejected' }, 403)
    }
  }

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

  let count = Number.parseInt(await env.VIEWS_KV.get(key), 10) || 0
  count += 1
  await env.VIEWS_KV.put(key, String(count))
  return json({ views: count })
}