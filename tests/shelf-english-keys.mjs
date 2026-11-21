/**
 * A shelf written in English.
 *
 * The theme's own files and everything `npm run covers` writes are in Chinese,
 * which is right for the site this theme was made for. But a shelf is just
 * Markdown, and an English writer reasonably expects `year:` to mean what
 * `年份:` means. It did not: the title and creator had English aliases and the
 * other four fields did not, so `year: 1960` read as no year at all — silently,
 * because a missing year is a legal state.
 */
import assert from 'node:assert/strict'
import { parseShelf } from '../src/utils/shelf.ts'

{
  // The English spelling of every field.
  const [book] = parseShelf([
    'title: The City of Invisible Things',
    'author: Italo Calvino',
    'year: 1972',
    'douban: https://book.douban.com/subject/10555509/',
    'cover: /shelf/abc123.jpg',
    'note: Read it twice; it changes.',
  ].join('\n'), 'book')
  assert.equal(book.title, 'The City of Invisible Things')
  assert.equal(book.creator, 'Italo Calvino')
  assert.equal(book.year, 1972)
  assert.equal(book.url, 'https://book.douban.com/subject/10555509/')
  assert.equal(book.cover, '/shelf/abc123.jpg')
  assert.equal(book.note, 'Read it twice; it changes.')
}
{
  // The Chinese spelling still works, unchanged.
  const [book] = parseShelf([
    '书名：城南旧事',
    '作者：林海音',
    '年份：1960',
    '豆瓣：https://book.douban.com/subject/3057333/',
    '封面：/shelf/abc123.jpg',
    '一句话：小时候读不懂。',
  ].join('\n'), 'book')
  assert.equal(book.title, '城南旧事')
  assert.equal(book.creator, '林海音')
  assert.equal(book.year, 1960)
  assert.equal(book.url, 'https://book.douban.com/subject/3057333/')
  assert.equal(book.cover, '/shelf/abc123.jpg')
  assert.equal(book.note, '小时候读不懂。')
}
{
  // A record's card opens the player, so `link` outranks `douban` for music —
  // and for a book the Douban page is what opens. Both are honoured either way.
  const [record] = parseShelf([
    'title: City',
    'artist: Deserts Chang',
    'year: 2009',
    'link: https://music.163.com/#/album?id=32312',
    'douban: https://music.douban.com/subject/3801228/',
  ].join('\n'), 'music')
  assert.equal(record.url, 'https://music.163.com/#/album?id=32312')

  const [book] = parseShelf([
    'title: A Book',
    'douban: https://book.douban.com/subject/1/',
    'link: https://example.com/other',
  ].join('\n'), 'book')
  assert.equal(book.url, 'https://book.douban.com/subject/1/')
}
{
  // A mixed block — either spelling, field by field — reads the same as an
  // all-Chinese one.
  const [film] = parseShelf([
    'title: Late Spring',
    '导演: Yasujirō Ozu',
    'year: 1949',
    '豆瓣: https://movie.douban.com/subject/1293328/',
  ].join('\n'), 'film')
  assert.equal(film.title, 'Late Spring')
  assert.equal(film.creator, 'Yasujirō Ozu')
  assert.equal(film.year, 1949)
  assert.equal(film.url, 'https://movie.douban.com/subject/1293328/')
}

console.log('shelf-english-keys: ok')
