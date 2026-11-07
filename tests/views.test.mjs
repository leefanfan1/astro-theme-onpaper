import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequest } from '../functions/api/views.js'

function fixture() {
  const values = new Map()
  const env = { VIEWS_KV: { get: async key => values.get(key) ?? null, put: async (key, value) => { values.set(key, value) } } }
  const request = (slug = 'hello-world', method = 'GET', headers = {}) => onRequest({
    request: new Request(`https://blog.example/api/views?slug=${encodeURIComponent(slug)}`, { method, headers }), env,
  })
  return { request, values }
}

test('view counts read without mutation, increment and isolate slugs', async () => {
  const { request, values } = fixture()
  assert.deepEqual(await (await request()).json(), { views: 0 })
  assert.equal(values.size, 0)
  assert.deepEqual(await (await request('hello-world', 'POST')).json(), { views: 1 })
  assert.deepEqual(await (await request()).json(), { views: 1 })
  assert.deepEqual(await (await request('another-post')).json(), { views: 0 })
})

test('cross-site increments are rejected before touching KV', async () => {
  const { request, values } = fixture()
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await request('hello-world', 'POST', headers)).status, 403)
  }
  assert.equal(values.size, 0)
  assert.equal((await request('hello-world', 'POST', { Origin: 'https://blog.example', 'Sec-Fetch-Site': 'same-origin' })).status, 200)
})

test('invalid slugs and methods cannot allocate counter keys', async () => {
  const { request, values } = fixture()
  for (const slug of ['', '../secret', '<script>', 'with space', 'Uppercase', 'a'.repeat(97)]) {
    assert.equal((await request(slug, 'POST')).status, 400, slug)
  }
  const response = await request('hello-world', 'DELETE')
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'GET, POST')
  assert.equal(values.size, 0)
})

test('missing KV returns a controlled error with non-cacheable JSON headers', async () => {
  const response = await onRequest({ request: new Request('https://blog.example/api/views?slug=hello-world'), env: {} })
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
  assert.match(response.headers.get('Content-Type'), /application\/json/)
})
