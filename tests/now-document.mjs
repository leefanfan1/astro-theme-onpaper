/**
 * "最近" (src/content/pages/now.md) is three two-line entries:
 *
 *   在听：《城市》
 *   张悬 https://open.spotify.com/album/…
 *
 * `npm run covers` completes them the way it completes the shelf, with two
 * differences the rendering forces: the year and a record's Douban page are
 * written into the file but never shown, and a book or film already carries
 * its Douban page inline on the credit line, so it gets no separate line.
 */
import assert from 'node:assert/strict'
import { isNowEntryComplete, nowEntriesOf, rewriteNow } from '../scripts/now-document.mjs'

const NOW = [
  '---',
  'title: 最近',
  '---',
  '',
  '# 最近',
  '',
  '<!--',
  '  在听：《城市》',
  '  张悬 https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy',
  '-->',
  '',
  '在听：《城市》',
  '张悬 https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy',
  '',
  '在读：《城南旧事》',
  '林海音 https://book.douban.com/subject/3057333/',
  '',
  '在看：《海街日记》',
  '是枝裕和 https://movie.douban.com/subject/25895901/',
  '',
].join('\r\n')

{
  const entries = nowEntriesOf(NOW)
  assert.deepEqual(entries.map(entry => entry.title), ['城市', '城南旧事', '海街日记'])
  assert.equal(entries[0].kind, 'music')
  assert.equal(entries[1].kind, 'book')
  assert.equal(entries[0].creator, '张悬')
  assert.equal(entries[0].url, 'https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy')
}
{
  // A record: the credit line's address becomes its NetEase page (that is
  // what the row opens), and the year and Douban page are recorded beside it.
  const result = rewriteNow(NOW, new Map([
    ['城市', { kind: 'music', creator: '张悬', year: '2009', douban: 'https://music.douban.com/subject/3801228/', link: 'https://music.163.com/#/album?id=32312' }],
  ]))
  assert.ok(result.text.includes([
    '在听：《城市》',
    '张悬 https://music.163.com/#/album?id=32312',
    '年份：2009',
    '豆瓣：https://music.douban.com/subject/3801228/',
  ].join('\r\n')))
  // The example inside the comment is documentation, not an entry.
  assert.ok(result.text.includes('  张悬 https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy'))
  // Reported in file order: the credit line comes before the added lines.
  assert.deepEqual(result.changed, [{ title: '城市', keys: ['链接', '年份', '豆瓣'] }])
}
{
  // A book already points at its Douban page on the credit line: the year is
  // the only thing missing, and no second Douban line appears.
  const result = rewriteNow(NOW, new Map([
    ['城南旧事', { kind: 'book', creator: '林海音', year: '1960', douban: 'https://book.douban.com/subject/3057333/' }],
  ]))
  assert.ok(result.text.includes('林海音 https://book.douban.com/subject/3057333/\r\n年份：1960\r\n'))
  assert.equal(result.text.match(/豆瓣：/g), null)
  assert.deepEqual(result.changed, [{ title: '城南旧事', keys: ['年份'] }])
}
{
  // The author's own creator name wins, and a second run changes nothing.
  const first = rewriteNow(NOW, new Map([
    ['城市', { kind: 'music', creator: '張懸', year: '2009', douban: 'https://music.douban.com/subject/3801228/', link: 'https://music.163.com/#/album?id=32312' }],
  ]))
  assert.ok(first.text.includes('张悬 https://music.163.com'))
  const second = rewriteNow(first.text, new Map([
    ['城市', { kind: 'music', creator: '張懸', year: '2009', douban: 'https://music.douban.com/subject/3801228/', link: 'https://music.163.com/#/album?id=32312' }],
  ]))
  assert.equal(second.text, first.text)
  assert.deepEqual(second.changed, [])
}
{
  // Nothing requested, and an entry with an unknown label: untouched.
  assert.equal(rewriteNow(NOW, new Map()).text, NOW)
  assert.equal(rewriteNow(NOW, new Map([['城南旧事', {}]])).text, NOW)
}

// The file's own line endings, spelled without escape sequences this shell
// would mangle.
const CRLF = String.fromCharCode(13, 10)

{
  // A label line alone — the shape now.md's comment says the script completes.
  // The credit line is the row's second line, so it is written there, ahead of
  // any reference line: put below `年份`, the column would draw `年份：1960` as
  // the entry's author.
  const labelOnly = ['在读：《城南旧事》', ''].join(CRLF)
  const result = rewriteNow(labelOnly, new Map([
    ['城南旧事', { kind: 'book', creator: '林海音', year: '1960', douban: 'https://book.douban.com/subject/3057333/' }],
  ]))
  assert.deepEqual(result.text.split(CRLF), [
    '在读：《城南旧事》',
    '林海音 https://book.douban.com/subject/3057333/',
    '年份：1960',
    '',
  ])
  // Reported in this file's words: a book's address is its Douban page.
  assert.deepEqual(result.changed, [{ title: '城南旧事', keys: ['豆瓣', '年份'] }])
}
{
  // The same shape for a record: the credit line opens the player, and the
  // Douban page is recorded on a line of its own after it.
  const labelOnly = ['在听：《城市》', ''].join(CRLF)
  const text = rewriteNow(labelOnly, new Map([
    ['城市', { kind: 'music', creator: '张悬', year: '2009', douban: 'https://music.douban.com/subject/3801228/', link: 'https://music.163.com/#/album?id=32312' }],
  ])).text
  assert.deepEqual(text.split(CRLF), [
    '在听：《城市》',
    '张悬 https://music.163.com/#/album?id=32312',
    '年份：2009',
    '豆瓣：https://music.douban.com/subject/3801228/',
    '',
  ])
}
{
  // A credit line typed without an address keeps its words and gains one; an
  // address the author gave a book is the page they chose, and stays.
  const bare = ['在读：《城南旧事》', '林海音', ''].join(CRLF)
  assert.deepEqual(rewriteNow(bare, new Map([
    ['城南旧事', { kind: 'book', year: '1960', douban: 'https://book.douban.com/subject/3057333/' }],
  ])).text.split(CRLF), [
    '在读：《城南旧事》',
    '林海音 https://book.douban.com/subject/3057333/',
    '年份：1960',
    '',
  ])
  const chosen = ['在读：《城南旧事》', '林海音 https://example.com/cheng-nan', ''].join(CRLF)
  assert.equal(rewriteNow(chosen, new Map([
    ['城南旧事', { kind: 'book', year: '1960', douban: 'https://book.douban.com/subject/3057333/' }],
  ])).text.split(CRLF)[1], '林海音 https://example.com/cheng-nan')
}
{
  // An entry whose lines were written by the older pass — a year line where
  // the credit belongs — is repaired rather than left as it is: the credit
  // goes above it, and the year line stays where it was.
  const broken = ['在读：《城南旧事》', '年份：1960', ''].join(CRLF)
  assert.deepEqual(rewriteNow(broken, new Map([
    ['城南旧事', { kind: 'book', creator: '林海音', year: '1960', douban: 'https://book.douban.com/subject/3057333/' }],
  ])).text.split(CRLF), [
    '在读：《城南旧事》',
    '林海音 https://book.douban.com/subject/3057333/',
    '年份：1960',
    '',
  ])
}

{
  // A reference line is not the credit line, on the way in either: an entry a
  // pass before the credit line left with only `年份：` has no creator yet, and
  // reading the year as one would search Douban for an author named `年份：2012`.
  assert.deepEqual(rewriteNow(['在读：《活着》', '年份：2012', ''].join(CRLF), new Map([
    ['活着', { kind: 'book', creator: '余华', year: '2012', douban: 'https://book.douban.com/subject/4913064/' }],
  ])).text.split(CRLF), [
    '在读：《活着》',
    '余华 https://book.douban.com/subject/4913064/',
    '年份：2012',
    '',
  ])
}
{
  // Whether a second run can skip an entry. A credit line pointing at the work,
  // a year, and for a record its Douban page; a year line alone is not it,
  // because the column draws the line above it as the author.
  const complete = lines => isNowEntryComplete(nowEntriesOf(lines.join(CRLF))[0])
  assert.equal(complete(['在读：《城南旧事》', '林海音 https://book.douban.com/subject/3057333/', '年份：1960', '']), true)
  assert.equal(complete(['在读：《城南旧事》', '年份：1960', '']), false)
  assert.equal(complete(['在读：《城南旧事》', '林海音', '年份：1960', '']), false)
  assert.equal(complete(['在读：《城南旧事》', '林海音 https://book.douban.com/subject/3057333/', '']), false)
  // A record's row opens its player, so a Douban address there is not the one.
  assert.equal(complete(['在听：《城市》', '张悬 https://music.douban.com/subject/3801228/', '年份：2009', '豆瓣：https://music.douban.com/subject/3801228/', '']), false)
  assert.equal(complete(['在听：《城市》', '张悬 https://music.163.com/#/album?id=32312', '年份：2009', '']), false)
  assert.equal(complete(['在听：《城市》', '张悬 https://music.163.com/#/album?id=32312', '年份：2009', '豆瓣：https://music.douban.com/subject/3801228/', '']), true)
}

console.log('now-document: ok')
