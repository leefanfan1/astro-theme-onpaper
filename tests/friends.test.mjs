import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseFriends } from '../src/utils/friends.ts'

test('friends content preserves all six cards and their order', () => {
  const source = readFileSync(new URL('../src/content/pages/friends.md', import.meta.url), 'utf8')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const friends = parseFriends(source)
  assert.deepEqual(friends.map(friend => friend.name), ['山茶书房', '夜航日志', '缓慢更新', '纸间', '苔庭', '余白'])
  assert.ok(friends.every(friend => /^https:\/\//.test(friend.url) && friend.description))
})

test('plain friend entries accept CRLF, whitespace, comments and optional descriptions', () => {
  assert.deepEqual(parseFriends('<!-- instructions -->\r\n\r\n Alice \r\n https://example.com/ \r\n first line\r\n second line\r\n \t\r\nBob\r\nhttp://example.org/'), [
    { name: 'Alice', url: 'https://example.com/', description: 'first line second line' },
    { name: 'Bob', url: 'http://example.org/', description: '' },
  ])
  assert.deepEqual(parseFriends('<!-- empty -->\n\n'), [])
})

test('friend URLs reject executable, local and malformed destinations', () => {
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'vbscript:msgbox(1)', 'ftp://example.com/', '//example.com/', 'not a URL']) {
    assert.throws(() => parseFriends(`Alice\n${url}`), undefined, url)
  }
  assert.throws(() => parseFriends('Only a name'))
})

test('multiple whitespace-only separators do not swallow subsequent friends', () => {
  const friends = parseFriends('Alice\nhttps://example.com/\n\n \n\u00a0\nBob\nhttps://example.org/')
  assert.deepEqual(friends.map(friend => friend.name), ['Alice', 'Bob'])
})

test('accepted URLs are canonical absolute destinations', () => {
  assert.equal(parseFriends('Alice\nhttps:example.com')[0].url, 'https://example.com/')
})
