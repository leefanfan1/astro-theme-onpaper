import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fontURL, validateDefinitions, parseHostedCSS, serializeHostedCSS, fetchHostedBytes } from '../src/plugins/hosted-font-source.mjs'

const font = 'https://fonts.gstatic.cn/s/newsreader/v26/example.woff2'
const face = { family: 'Newsreader', url: font, style: 'normal', weight: '400 700', range: 'U+20-7E,U+0100-02BA,U+4??' }
const nativeFetch = globalThis.fetch
let checks = 0
const rejectsDefinition = input => { assert.throws(() => validateDefinitions([input], 'Newsreader')); checks++ }
const rejectsCSS = input => { assert.throws(() => parseHostedCSS(input)); checks++ }
const cssFace = extra => `@font-face{font-family:'Newsreader';font-style:normal;font-weight:400 700;font-display:swap;src:url(${font}) format('woff2');unicode-range:U+20-7E;${extra}}`

// Real Google CSS shapes: quoted and unquoted URLs, comments, variable weights,
// a text-subset URL, and unicode shards. Safe serialization is canonical data.
const googleCSS = `/* latin */
@font-face {font-family:'Newsreader';font-style:italic;font-weight:400 700;font-display:block;src:url(${font}) format('woff2');unicode-range:U+0000-00FF, U+0131;}
@font-face {font-family:"Noto Serif SC";font-style:normal;font-weight:200 900;font-stretch:normal;src:url("https://fonts.gstatic.cn/l/font?kit=example&v=v36") format("woff2");unicode-range:U+4E00-9FFF;}`
const definitions = parseHostedCSS(googleCSS)
assert.equal(definitions.length, 2)
assert.deepEqual(parseHostedCSS(serializeHostedCSS(definitions)), definitions)
assert.equal(validateDefinitions([{ ...face, weight: '400\t700' }])[0].weight, '400 700')
assert.equal(fontURL('https://fonts.gstatic.cn:443/s/font.woff2'), 'https://fonts.gstatic.cn/s/font.woff2')
assert.ok(!serializeHostedCSS(definitions).includes('</style'))
checks += 5

// This exact descriptor previously crossed the inline style boundary and
// produced a script node after a successful upstream URL allowlist check.
const injection = "'normal</style><script data-security-probe>globalThis.__securityProbe=true</script><style>'"
rejectsCSS(cssFace('').replace('font-style:normal', 'font-style:' + injection))
rejectsDefinition({ ...face, style: injection })
rejectsDefinition({ ...face, weight: '400</style><script>alert(1)</script>' })
for (const family of ['Other', 'Newsreader</style>', '']) rejectsDefinition({ ...face, family })
for (const style of ['oblique', 'normal;display:none', '', null, 1]) rejectsDefinition({ ...face, style })
for (const weight of ['0', '1001', '-1', '700 400', '400 700 900', '400.5', 'bold', '400!important', '', 400, null]) rejectsDefinition({ ...face, weight })
for (const range of ['U+110000', 'U+9FFF-4E00', 'U+20;display:none', 'U+???????', 'U+?A', 'U+4?-4FFF', '', null]) rejectsDefinition({ ...face, range })
for (const input of [null, {}, [], Array.from({ length: 257 }, () => face)]) { assert.throws(() => validateDefinitions(input)); checks++ }
assert.throws(() => validateDefinitions([face], 'Noto Serif SC')); checks++

for (const url of [
  'http://fonts.gstatic.cn/s/font.woff2', 'https://fonts.gstatic.cn.attacker.example/s/font.woff2',
  'https://fonts.gstatic.cn@127.0.0.1/s/font.woff2', 'https://user:secret@fonts.gstatic.cn/s/font.woff2',
  'https://fonts.gstatic.cn:444/s/font.woff2', font + '#fragment',
  'https://fonts.gstatic.cn/other/font.woff2', 'file:///tmp/font.woff2', 'data:font/woff2;base64,d09GMg==',
]) rejectsDefinition({ ...face, url })

for (const css of [
  cssFace('') + '@import url(https://attacker.example/style.css);',
  cssFace('') + 'body{display:none}', cssFace('') + '@media all{body{display:none}}',
  cssFace('color:red;'), cssFace('font-style:italic;'), cssFace('').replace('font-style:normal', 'font-style:normal!important'),
  cssFace('').replace(`url(${font}) format('woff2')`, `local('Newsreader'),url(${font}) format('woff2')`),
  cssFace('').replace(`url(${font}) format('woff2')`, `url(${font}) format('truetype')`),
  cssFace('').replace('font-display:swap', 'font-stretch:condensed'),
  '<style>' + cssFace('') + '</style>', '/*' + '汉'.repeat(90000) + '*/',
]) rejectsCSS(css)

const hits = { private: 0, redirect: 0, target: 0 }
const server = createServer((req, res) => {
  if (req.url === '/redirect') { hits.redirect++; res.writeHead(302, { Location: '/redirect-target' }).end(); return }
  if (req.url === '/redirect-target') hits.target++
  else hits.private++
  res.writeHead(200, { 'Content-Type': 'font/woff2' }).end('wOF2fixture')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const local = 'http://127.0.0.1:' + server.address().port
try {
  // The prior poisoned-cache PoC actually hit this kind of loopback endpoint.
  // Exercise the same boundary with real fetch available: it must reject first.
  rejectsDefinition({ ...face, url: local + '/private-font-fixture' })
  await assert.rejects(fetchHostedBytes(local + '/private-font-fixture', 'font'))
  await assert.rejects(fetchHostedBytes(local + '/private-font-fixture', 'css'))
  assert.equal(hits.private, 0); checks += 3

  // Replace only the transport destination with an isolated HTTP fixture. The
  // helper still validates a normal CDN URL; native fetch enforces redirect:error.
  globalThis.fetch = (url, options) => {
    assert.equal(url, font)
    assert.equal(options.redirect, 'error')
    return nativeFetch(local + '/redirect', options)
  }
  await assert.rejects(fetchHostedBytes(font, 'font'))
  assert.equal(hits.redirect, 1)
  assert.equal(hits.target, 0); checks += 3

  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(Buffer.from('wOF2fixture'))
  }
  assert.equal((await fetchHostedBytes(font, 'font')).toString(), 'wOF2fixture')
  assert.equal(calls, 1); checks += 2
  for (const url of ['http://fonts.googleapis.cn/css2', 'https://user:secret@fonts.googleapis.cn/css2', 'https://fonts.googleapis.cn:444/css2', 'https://fonts.googleapis.cn/css2#fragment', 'https://fonts.googleapis.cn/other', 'https://attacker.example/css2']) {
    await assert.rejects(fetchHostedBytes(url, 'css')); checks++
  }
  assert.equal(calls, 1, 'disallowed endpoints must be rejected before fetch')

  for (const [kind, url, limit] of [['css', 'https://fonts.googleapis.cn/css2?family=Newsreader', 262144], ['font', font, 8 * 1024 * 1024]]) {
    let cancelled = 0
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { 'Content-Length': String(limit + 1) } })
    await assert.rejects(fetchHostedBytes(url, kind), /too large/)
    assert.equal(cancelled, 1, 'oversized declared response must cancel its stream')
    cancelled = 0
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(limit)); controller.enqueue(new Uint8Array(1)) },
      cancel() { cancelled++ },
    }))
    await assert.rejects(fetchHostedBytes(url, kind), /too large/)
    assert.equal(cancelled, 1, 'streamed response must enforce the limit without Content-Length')
    checks += 4
  }
  globalThis.fetch = async () => new Response('not a font')
  await assert.rejects(fetchHostedBytes(font, 'font'), /WOFF2/); checks++
  globalThis.fetch = async () => new Response('error', { status: 503 })
  await assert.rejects(fetchHostedBytes(font, 'font'), /503/); checks++
} finally {
  globalThis.fetch = nativeFetch
  server.closeAllConnections()
  server.close()
}
console.log('PASS hosted font security: ' + checks + ' checks; provider CSS injection, poisoned cache URLs, redirects and response-size limits')
