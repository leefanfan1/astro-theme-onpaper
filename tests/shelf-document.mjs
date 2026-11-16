/**
 * The shelf documents as files: `npm run covers` rewrites three Markdown files
 * the author keeps in git, so the only lines it may touch are the entry blocks
 * it was asked to complete. Everything else — the heading, the explanatory
 * comment (which contains example entries), the blank lines, the line endings
 * (books.md and films.md are CRLF, music.md is LF) — comes back unchanged.
 */
import assert from 'node:assert/strict'
import { rewriteDocument } from '../scripts/shelf-document.mjs'

const BOOKS = [
  '# 书单',
  '',
  '<!--',
  '  书名：城南旧事',
  '  作者：林海音',
  '-->',
  '',
  '书名：城南旧事',
  '作者：林海音',
  '年份：1960',
  '',
  '书名：看不见的城市',
  '',
].join('\r\n')

{
  // The example inside the comment is not an entry, and CRLF survives.
  const result = rewriteDocument(BOOKS, 'book', new Map([
    ['城南旧事', [{ key: '豆瓣', value: 'https://book.douban.com/subject/3057333/' }]],
    ['看不见的城市', [{ key: '作者', value: '伊塔洛·卡尔维诺' }, { key: '年份', value: '1972' }]],
  ]))
  const expected = [
    '# 书单',
    '',
    '<!--',
    '  书名：城南旧事',
    '  作者：林海音',
    '-->',
    '',
    '书名：城南旧事',
    '作者：林海音',
    '年份：1960',
    '豆瓣：https://book.douban.com/subject/3057333/',
    '',
    '书名：看不见的城市',
    '作者：伊塔洛·卡尔维诺',
    '年份：1972',
    '',
  ].join('\r\n')
  assert.equal(result.text, expected)
  assert.deepEqual(result.changed, [
    { title: '城南旧事', keys: ['豆瓣'] },
    { title: '看不见的城市', keys: ['作者', '年份'] },
  ])
}
{
  // Nothing requested: the file is returned byte for byte, and so is an entry
  // whose fields are all present already.
  assert.equal(rewriteDocument(BOOKS, 'book', new Map()).text, BOOKS)
  assert.equal(rewriteDocument(BOOKS, 'book', new Map([['城南旧事', []]])).text, BOOKS)
}
{
  // LF files stay LF, and a file with no trailing newline keeps it that way.
  const music = '名称：十年自选\r\n歌手：陈粒\n链接：https://open.spotify.com/album/6fbvyqPZVxVPk5DBm4krJf'
  const result = rewriteDocument(music, 'music', new Map([
    ['十年自选', [{ key: '链接', value: 'https://music.163.com/#/album?id=286217101', mode: 'set' }]],
  ]))
  assert.ok(!result.text.endsWith('\n'))
  // The document's first line ending wins for the whole file, as it did
  // before: this is a plain split-and-rejoin, not a per-line rewrite.
  assert.ok(result.text.includes('https://music.163.com/#/album?id=286217101'))
  assert.ok(!result.text.includes('spotify'))
}
{
  // A title nobody asked about is untouched, and a block that only looks like
  // an entry (a heading with a colon) is not matched.
  const films = '片名：一一\n导演：杨德昌\n\n片名：花样年华\n'
  const result = rewriteDocument(films, 'film', new Map([['一一', [{ key: '年份', value: '2000' }]]]))
  assert.equal(result.text, '片名：一一\n导演：杨德昌\n年份：2000\n\n片名：花样年华\n')
  assert.deepEqual(result.changed, [{ title: '一一', keys: ['年份'] }])
}

console.log('shelf-document: ok')
