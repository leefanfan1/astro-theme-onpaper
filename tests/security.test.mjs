import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import remarkDirective from 'remark-directive'
import { onRequest } from '../functions/api/views.js'
import { rehypeExternalLinks } from '../src/plugins/rehype-external-links.mjs'
import { remarkEditorialExtensions } from '../src/plugins/remark-editorial-extensions.mjs'
import { detectPlatform, resolveMusicUrl } from '../src/utils/music-resolver.mjs'

const processor = await createMarkdownProcessor({
  remarkPlugins: [remarkDirective, remarkEditorialExtensions],
  rehypePlugins: [rehypeExternalLinks],
})

test('raw HTML and Markdown dangerous schemes are filtered after entity decoding', async () => {
  for (const scheme of ['javascript:', 'java&#x09;script:', 'java&#10;script:', '&#1;javascript:', 'data:', 'vbscript:']) {
    const { code } = await processor.render('<a href="' + scheme + 'alert(1)">click</a>')
    assert.match(code, /href="#"/)
  }
  const { code } = await processor.render('[click](javascript:alert%281%29)')
  assert.match(code, /href="#"/)
})

test('SVG link destinations use the same URL policy without changing safe artwork', async () => {
  for (const attr of ['href', 'xlink:href']) {
    for (const scheme of ['javascript:', 'java&#x09;script:', 'java&#10;script:', 'data:', 'vbscript:']) {
      const { code } = await processor.render('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a ' + attr + '="' + scheme + 'window.auditExecuted=1"><text x="0" y="20">click</text></a></svg>')
      assert.match(code, new RegExp(attr + '="#"'))
    }
  }
  const { code } = await processor.render('<svg><a xlink:href="#safe"><circle id="safe" r="10"></circle></a></svg>')
  assert.match(code, /xlink:href="#safe"/)
  assert.match(code, /<circle id="safe" r="10"/)
})

test('raw media, forms and objects also use the URL policy', async () => {
  const { code } = await processor.render('<iframe src="java&#9;script:alert(1)"></iframe><object data="data:text/html,test"></object><form action="javascript:alert(1)"></form>')
  assert.doesNotMatch(code, /\s(?:src|data|action)=/)
})

test('raw links retain safe attributes, media and literal code keep working', async () => {
  const { code } = await processor.render('<a href="https://example.com/?a=1&amp;b=2">safe</a>\n\n<iframe src="https://player.vimeo.com/video/123"></iframe>\n\n~~~html\n<a href="javascript:alert(1)">example</a>\n~~~'.replaceAll('\\n', '\n'))
  assert.match(code, /target="_blank" rel="noopener noreferrer"/)
  assert.match(code, /src="https:\/\/player.vimeo.com\/video\/123"/)
  assert.match(code, /&#x3C;|&lt;/)
  assert.match(code, /javascript:alert/)
})

test('manual music cards and video directives keep escaping text and attributes', async () => {
  const tree = { type: 'root', children: [{ type: 'leafDirective', name: 'music-card', attributes: {
    title: '<script>window.audit=1</script>', artist: '\" onerror=alert(1)',
    cover: 'javascript:alert(1)', spotify: 'javascript:alert(1)',
    apple: 'https://music.apple.com/cn/album/test/123?x=" onclick="evil',
  } }] }
  await remarkEditorialExtensions()(tree)
  const output = tree.children[0].value
  assert.doesNotMatch(output, /<script>|<img|href="javascript:/)
  assert.match(output, /&lt;script&gt;/)
  assert.match(output, /&quot; onclick=&quot;evil/)
  const { code } = await processor.render('::embed{url="https://www.bilibili.com/video/BV12345" title="safe"}')
  assert.match(code, /src="https:\/\/player.bilibili.com\/player.html\?bvid=BV12345/)
})

test('redirects cannot leave the allowed music hosts (real local HTTP transport)', async (t) => {
  let privateHits = 0
  const server = createServer((req, res) => {
    if (req.url === '/private') {
      privateHits++
      res.end('private fixture')
    } else {
      res.writeHead(302, { Location: 'http://127.0.0.1:' + server.address().port + '/private' })
      res.end()
    }
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const nativeFetch = globalThis.fetch
  const calls = []
  // Only transport is redirected to localhost; the resolver sees the genuine
  // allowlisted URL and must inspect the returned Location before following.
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), redirect: options?.redirect })
    return nativeFetch('http://127.0.0.1:' + server.address().port + '/entry', options)
  })
  await resolveMusicUrl('https://y.qq.com/n/ryqq/songDetail/AuditPrivateRedirect')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].redirect, 'manual')
  assert.equal(privateHits, 0)
})

test('relative redirects work while loops, forbidden credentials, ports and schemes stop', async (t) => {
  const fixtures = [
    'http://music.163.com/private',
    'https://music.163.com.evil.invalid/private',
    'https://user:pass@y.qq.com/private',
    'https://y.qq.com:8443/private',
    'https://127.0.0.1/private',
  ]
  let location = ''
  let requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url))
    assert.equal(options.redirect, 'manual')
    if (location === 'relative' && requests.length === 2) return new Response('')
    return new Response('', { status: 302, headers: { Location: location === 'relative' ? '/landing' : location } })
  })
  for (const [index, target] of fixtures.entries()) {
    location = target
    requests = []
    await resolveMusicUrl('https://y.qq.com/n/ryqq/songDetail/AuditRedirect' + index)
    assert.equal(requests.length, 1, target)
  }
  location = 'relative'
  requests = []
  await resolveMusicUrl('https://y.qq.com/n/ryqq/songDetail/AuditRelative')
  assert.deepEqual(requests, ['https://y.qq.com/n/ryqq/songDetail/AuditRelative', 'https://y.qq.com/landing'])
  location = '/loop'
  requests = []
  await resolveMusicUrl('https://y.qq.com/n/ryqq/songDetail/AuditLoop')
  assert.equal(requests.length, 6)
})

test('oversized chunked responses are cancelled before being fully buffered', async (t) => {
  let cancelled = false
  let chunks = 0
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull(controller) {
      chunks++
      if (chunks <= 12) controller.enqueue(new Uint8Array(1024 * 1024))
      else controller.close()
    },
    cancel() { cancelled = true },
  })))
  await resolveMusicUrl('https://y.qq.com/n/ryqq/songDetail/AuditOversized')
  assert.equal(cancelled, true)
  assert.ok(chunks < 12)
})

test('cached music keeps working offline and arbitrary input hosts are rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network') })
  const cached = await resolveMusicUrl('https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy')
  assert.equal(cached.title, '城市')
  assert.ok(cached.links.apple)
  for (const url of ['http://169.254.169.254/music.163.com/', 'https://music.163.com.evil.invalid/song/1', 'https://music.163.com@127.0.0.1/song/1']) {
    assert.equal(detectPlatform(url), null)
    await assert.rejects(resolveMusicUrl(url), /Unsupported/)
  }
})

test('remote music fields are escaped through the actual metadata/render pipeline', async (t) => {
  const attack = '<script>window.auditExecuted=1</script>'
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url))
    assert.equal(options.redirect, 'manual')
    const data = String(url).includes('/oembed?')
      ? { title: attack, author_name: attack, thumbnail_url: 'https://example.com/cover.jpg' }
      : {}
    return Response.json(data)
  })
  const { code } = await processor.render('::music{url="https://open.spotify.com/track/AuditRemoteMetadata"}')
  assert.match(code, /(?:&lt;|&#x3C;)script(?:&gt;|>)/)
  assert.doesNotMatch(code, /<script>/)
  assert.match(code, /mc-title/)
  assert.ok(requests.some(url => url.startsWith('https://itunes.apple.com/search?')))
  assert.ok(requests.some(url => url.startsWith('https://music.163.com/api/cloudsearch/')))
  assert.ok(requests.some(url => url.startsWith('https://c.y.qq.com/')))
})

test('view endpoint validates requests, rejects cross-site writes, and preserves reads', async () => {
  const store = new Map()
  let writes = 0
  const env = { VIEWS_KV: {
    get: async key => store.get(key),
    put: async (key, value) => { writes++; store.set(key, value) },
  } }
  const call = (slug, method = 'GET', headers = {}) => onRequest({
    request: new Request('https://blog.example/api/views?slug=' + encodeURIComponent(slug), { method, headers }), env,
  })
  for (const headers of [{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }]) {
    assert.equal((await call('test-post', 'POST', headers)).status, 403)
  }
  assert.equal(writes, 0)
  assert.equal((await call('../bad', 'POST')).status, 400)
  assert.equal((await call('a'.repeat(97), 'POST')).status, 400)
  assert.equal((await call('test-post', 'PUT')).status, 405)
  const response = await call('test-post', 'POST', { Origin: 'https://blog.example' })
  assert.deepEqual(await response.json(), { views: 1 })
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await (await call('test-post')).json(), { views: 1 })
  assert.equal(writes, 1)
  const unavailable = await onRequest({ request: new Request('https://blog.example/api/views?slug=test'), env: {} })
  assert.equal(unavailable.status, 503)
})


test('declared oversized bodies are cancelled without starting a reader', async (t) => {
  let cancelled = false
  let reads = 0
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull() { reads++ },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 }), { headers: { 'Content-Length': String(6 * 1024 * 1024) } }))
  await resolveMusicUrl('https://y.qq.com/n/ryqq/songDetail/AuditContentLength')
  assert.equal(cancelled, true)
  assert.equal(reads, 0)
})

test('direct NetEase API requests share redirect and response boundaries', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url))
    assert.equal(options.redirect, 'manual')
    assert.equal(options.credentials, 'omit')
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json({ songs: [{ name: '', artists: [], ar: [], al: { name: '' } }] })
  })
  await resolveMusicUrl('https://music.163.com/#/song?id=987654321001')
  await resolveMusicUrl('https://music.163.com/#/album?id=987654321002')
  assert.equal(requests.length, 2)
  assert.ok(requests[0].startsWith('https://music.163.com/api/song/detail?'))
  assert.equal(requests[1], 'https://music.163.com/api/v1/album/987654321002')
})
