/**
 * The shelf entry editor: `npm run covers` fills in the fields it can find and
 * writes them back to src/content/shelf/*.md. What it may NOT do is rewrite the
 * author's own words, so these cases pin the two rules — fill an absent line,
 * never overwrite a present one — and the canonical field order inside a block.
 */
import assert from 'node:assert/strict'
import { updateEntry, parseEntry } from '../scripts/shelf-fields.mjs'

const lines = text => text.split('\n')

{
  // Nothing to add: the block comes back byte for byte.
  const block = lines('书名：城南旧事\n作者：林海音\n年份：1960\n豆瓣：https://book.douban.com/subject/3057333/')
  const result = updateEntry(block, 'book', [])
  assert.deepEqual(result.lines, block)
  assert.deepEqual(result.changed, [])
}
{
  // Every key absent: inserted in the order the file's own comment documents.
  const result = updateEntry(lines('书名：看不见的城市'), 'book', [
    { key: '作者', value: '伊塔洛·卡尔维诺' },
    { key: '年份', value: '1972' },
    { key: '豆瓣', value: 'https://book.douban.com/subject/10555509/' },
  ])
  assert.deepEqual(result.lines, lines('书名：看不见的城市\n作者：伊塔洛·卡尔维诺\n年份：1972\n豆瓣：https://book.douban.com/subject/10555509/'))
  assert.deepEqual(result.changed, ['作者', '年份', '豆瓣'])
}
{
  // A present value wins over the one Douban would supply.
  const result = updateEntry(lines('书名：城南旧事\n作者：林海音\n年份：1960'), 'book', [
    { key: '作者', value: '林海音（豆瓣）' },
    { key: '年份', value: '2008' },
    { key: '豆瓣', value: 'https://book.douban.com/subject/3057333/' },
  ])
  assert.deepEqual(result.lines, lines('书名：城南旧事\n作者：林海音\n年份：1960\n豆瓣：https://book.douban.com/subject/3057333/'))
  assert.deepEqual(result.changed, ['豆瓣'])
}
{
  // A gap in the middle closes at its canonical place, not at the end.
  const result = updateEntry(lines('名称：十年自选\n歌手：陈粒\n链接：https://open.spotify.com/album/6fbvyqPZVxVPk5DBm4krJf'), 'music', [
    { key: '年份', value: '2025' },
    { key: '豆瓣', value: 'https://music.douban.com/subject/37558992/' },
  ])
  assert.deepEqual(result.lines, lines([
    '名称：十年自选',
    '歌手：陈粒',
    '年份：2025',
    '链接：https://open.spotify.com/album/6fbvyqPZVxVPk5DBm4krJf',
    '豆瓣：https://music.douban.com/subject/37558992/',
  ].join('\n')))
}
{
  // `set` is the one explicit overwrite: the music shelf's 链接 line becomes
  // the NetEase address, keeping whatever spacing the author typed.
  const result = updateEntry(lines('名称：城市\n歌手：张悬\n链接: https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy'), 'music', [
    { key: '链接', value: 'https://music.163.com/#/album?id=32312', mode: 'set' },
  ])
  assert.deepEqual(result.lines, lines('名称：城市\n歌手：张悬\n链接: https://music.163.com/#/album?id=32312'))
  assert.deepEqual(result.changed, ['链接'])
}
{
  // An already-correct `set` is not a change, so a re-run leaves the file alone.
  const block = lines('名称：城市\n链接：https://music.163.com/#/album?id=32312')
  const result = updateEntry(block, 'music', [{ key: '链接', value: 'https://music.163.com/#/album?id=32312', mode: 'set' }])
  assert.deepEqual(result.lines, block)
  assert.deepEqual(result.changed, [])
}
{
  // A key the theme does not know about is left where it is, and a later
  // canonical field still lands before it.
  const result = updateEntry(lines('片名：一一\n导演：杨德昌\n译名：Yi Yi'), 'film', [
    { key: '豆瓣', value: 'https://movie.douban.com/subject/1292434/' },
  ])
  assert.deepEqual(result.lines, lines('片名：一一\n导演：杨德昌\n豆瓣：https://movie.douban.com/subject/1292434/\n译名：Yi Yi'))
}
{
  // An empty value is not a value: the line stays absent.
  const result = updateEntry(lines('书名：城南旧事'), 'book', [
    { key: '作者', value: '' },
    { key: '年份', value: '   ' },
  ])
  assert.deepEqual(result.lines, lines('书名：城南旧事'))
  assert.deepEqual(result.changed, [])
}
{
  // Reading a block back: the title and the fields the editor keys on.
  const entry = parseEntry(lines('  书名 : 城南旧事  \n作者：林海音'))
  assert.equal(entry.fields.get('书名'), '城南旧事')
  assert.equal(entry.fields.get('作者'), '林海音')
  assert.equal(entry.title('book'), '城南旧事')
  assert.equal(entry.title('music'), '')
}

console.log('shelf-metadata: ok')
