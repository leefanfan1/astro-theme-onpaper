/**
 * Local stand-in for the Cloudflare Pages Function at functions/api/views.js.
 * It lets `astro dev` show a working view counter without a Cloudflare account.
 * Counts live in memory and reset on restart.
 */

function createCounts() {
  return new Map()
}

function handleViews(req, res, counts) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname !== '/api/views') return false

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return true
  }

  const slug = url.searchParams.get('slug') ?? ''
  if (!/^[\w-]{1,96}$/.test(slug)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Invalid slug parameter' }))
    return true
  }

  let views = counts.get(slug) ?? 0
  if (req.method === 'POST') {
    views += 1
    counts.set(slug, views)
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ views, source: 'dev' }))
  return true
}

export function devViews() {
  const counts = createCounts()
  const middleware = (req, res, next) => {
    if (!handleViews(req, res, counts)) next()
  }
  return {
    name: 'yohaku-dev-views',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export function devViewsIntegration() {
  const counts = createCounts()
  return {
    name: 'yohaku-dev-views-integration',
    hooks: {
      'astro:server:setup': ({ server }) => {
        // Astro 7's dev router answers page requests before Vite's Connect
        // middleware. Wrap the HTTP request listeners so /api/views is handled
        // first and the static route never tries to write the same response.
        const httpServer = server.httpServer
        if (httpServer) {
          const previous = httpServer.listeners('request').slice()
          httpServer.removeAllListeners('request')
          httpServer.on('request', (req, res) => {
            if (handleViews(req, res, counts)) return
            for (const listener of previous) listener.call(httpServer, req, res)
          })
        }
        server.middlewares.use((req, res, next) => {
          if (!handleViews(req, res, counts)) next()
        })
      },
    },
  }
}