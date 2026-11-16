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
import { nowEntriesOf, rewriteNow } from '../scripts/now-document.mjs'

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

console.log('now-document: ok')
