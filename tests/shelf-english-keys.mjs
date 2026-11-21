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


// ── what `npm run covers` does with an English shelf ───────────────────────
//
// Reading an English shelf was only half of it. The script also writes back,
// and it wrote Chinese keys into an English block — `作者: Lin Haiyin` after a
// `author: Lin Haiyin` that was already there, then never counted the entry
// as complete because it looked for `作者` and found `author`. Both halves are
// checked here.
{
  const { updateEntry } = await import('../scripts/shelf-fields.mjs')

  // A missing field is written in the block's own language, and its own colon.
  const en = updateEntry(['title: Some Book', 'author: Someone'], 'book', [
    { key: '年份', value: '1999' },
    { key: '豆瓣', value: 'https://book.douban.com/subject/1/' },
  ])
  assert.deepEqual(en.lines, [
    'title: Some Book',
    'author: Someone',
    'year: 1999',
    'douban: https://book.douban.com/subject/1/',
  ])

  // A field the block already has — in English — is not added again.
  const dupe = updateEntry(['title: Some Book', 'author: Someone'], 'book', [
    { key: '作者', value: 'Someone' },
  ])
  assert.deepEqual(dupe.lines, ['title: Some Book', 'author: Someone'])

  // The Chinese spelling still writes Chinese, with the full-width colon.
  const zh = updateEntry(['书名：某书', '作者：某人'], 'book', [
    { key: '年份', value: '1999' },
  ])
  assert.deepEqual(zh.lines, ['书名：某书', '作者：某人', '年份：1999'])

  // A record written in English gains `artist:` and `link:`.
  const music = updateEntry(['title: Some Album'], 'music', [
    { key: '歌手', value: 'X' },
    { key: '链接', value: 'https://music.163.com/#/album?id=1' },
  ])
  assert.deepEqual(music.lines, [
    'title: Some Album',
    'artist: X',
    'link: https://music.163.com/#/album?id=1',
  ])
}
{
  // The reader `npm run covers` uses has to agree with the one the page uses,
  // or an English entry looks incomplete on every run and is completed twice.
  const { FIELD_KEYS } = await import('../scripts/shelf-fields.mjs')
  assert.deepEqual(FIELD_KEYS.年份, ['年份', 'year'])
  assert.deepEqual(FIELD_KEYS.豆瓣, ['豆瓣', 'douban'])
  assert.deepEqual(FIELD_KEYS.封面, ['封面', 'cover'])
  assert.deepEqual(FIELD_KEYS.一句话, ['一句话', 'note'])
  assert.deepEqual(FIELD_KEYS.链接, ['链接', 'link', 'url'])
}


// ── the "Recently" column in English ───────────────────────────────────────
//
// The same half-migrated problem, one file over: an English entry was
// completed with English keys and then judged incomplete on the next run,
// because the completeness test only knew `年份：`.
{
  const { isNowEntryComplete, nowEntriesOf, rewriteNow } = await import('../scripts/now-document.mjs')
  const NL = String.fromCharCode(13, 10)

  const en = ['Listening：《City》', '', 'Reading：《Some Book》', ''].join(NL)
  const written = rewriteNow(en, new Map([
    ['City', { kind: 'music', creator: 'X', year: '2009', douban: 'https://music.douban.com/subject/1/', link: 'https://music.163.com/#/album?id=1' }],
    ['Some Book', { kind: 'book', creator: 'Y', year: '1999', douban: 'https://book.douban.com/subject/2/' }],
  ])).text

  // English keys, English colon, for both entries.
  assert.match(written, /^year: 2009$/m)
  assert.match(written, /^douban: https:\/\/music\.douban\.com\/subject\/1\/$/m)
  assert.doesNotMatch(written, /年份|豆瓣/, 'a completed English entry stays English')

  // And a second run costs nothing: both are complete.
  const entries = nowEntriesOf(written)
  assert.equal(entries.length, 2)
  for (const entry of entries) assert.ok(isNowEntryComplete(entry), `${entry.title} should be complete`)

  // The Chinese column still completes in Chinese.
  const zh = ['在听：《城市》', '', '在读：《书》', ''].join(NL)
  const zhWritten = rewriteNow(zh, new Map([
    ['城市', { kind: 'music', creator: 'X', year: '2009', douban: 'https://music.douban.com/subject/1/', link: 'https://music.163.com/#/album?id=1' }],
    ['书', { kind: 'book', creator: 'Y', year: '1999', douban: 'https://book.douban.com/subject/2/' }],
  ])).text
  assert.match(zhWritten, /^年份：2009$/m)
  for (const entry of nowEntriesOf(zhWritten)) assert.ok(isNowEntryComplete(entry))
}


// ── what the page draws for an English "Recently" row ─────────────────────
//
// The renderer had the same two Chinese-only assumptions as the script: a
// four-character label limit, and a list of Chinese reference-line names. With
// both, an English column drew nothing at all (the label never matched) or
// drew `year: 2009` as the entry's author.
{
  const { parseNow } = await import('../src/utils/shelf.ts')

  const full = parseNow([
    'Reading：《Some Book》',
    'Y https://book.douban.com/subject/2/',
    'year: 1999',
  ].join('\r\n'))
  assert.equal(full.length, 1)
  assert.equal(full[0].label, 'Reading')
  assert.equal(full[0].creator, 'Y')
  assert.equal(full[0].url, 'https://book.douban.com/subject/2/')

  // A row with only a reference line has no creator — it must not draw the
  // year as one.
  const bare = parseNow(['Reading：《Some Book》', 'year: 1999'].join('\r\n'))
  assert.equal(bare.length, 1)
  assert.equal(bare[0].creator, '')
  assert.equal(bare[0].url, undefined)

  // The Chinese form is unchanged.
  const zh = parseNow(['在读：《某书》', '某人 https://book.douban.com/subject/2/', '年份：1999'].join('\r\n'))
  assert.equal(zh[0].label, '在读')
  assert.equal(zh[0].creator, '某人')
}

console.log('shelf-english-keys: ok — read, write back and render, in both languages')
