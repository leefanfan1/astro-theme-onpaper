/**
 * The mobile-subject JSON is where a shelf entry's creator comes from, and a
 * film and a TV series are not the same endpoint: a series's id answers on
 * `/tv/`, and asking `/movie/` for it redirects there. `get()` refuses
 * redirects on purpose — nothing here follows a host it did not ask for — so
 * before this the series' page came back empty and films.md lost its director.
 *
 * These cases stub fetch instead of reaching Douban: what is being pinned is
 * which paths are tried and what is read out of the answer, not the network.
 */
import assert from 'node:assert/strict'
import { subjectDetail } from '../scripts/douban.mjs'

const realFetch = globalThis.fetch
const calls = []

/** A Douban-shaped answer, or a request that behaves like the real one. */
function stub(routes) {
  calls.length = 0
  globalThis.fetch = async url => {
    calls.push(String(url))
    for (const [pattern, answer] of routes) {
      if (!String(url).includes(pattern)) continue
      if (answer === 'redirect') throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') })
      return { ok: true, status: 200, json: async () => answer }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
}

try {
  {
    // A series: `/movie/` redirects, `/tv/` answers, and the director survives.
    stub([
      ['/movie/26302614', 'redirect'],
      ['/tv/26302614', {
        title: '请回答1988',
        year: '2015',
        card_subtitle: '2015 / 韩国 / 剧情 喜剧 爱情 / 申元浩 / 成东日 李一花',
        directors: [{ name: '申元浩' }],
        pic: { large: 'https://img9.doubanio.com/view/photo/l/public/p2272387542.jpg' },
      }],
    ])
    const series = await subjectDetail('film', 26302614)
    assert.equal(series.creator, '申元浩')
    assert.equal(series.year, 2015)
    assert.ok(calls.some(url => url.includes('/tv/26302614')), 'the tv path is tried')
  }
  {
    // A film: `/movie/` answers, so nothing else is asked for.
    stub([
      ['/movie/25895901', {
        title: '海街日记',
        year: '2015',
        directors: [{ name: '是枝裕和' }],
        pic: { large: 'https://img3.doubanio.com/view/photo/l/public/p2242546753.jpg' },
      }],
    ])
    const film = await subjectDetail('film', 25895901)
    assert.equal(film.creator, '是枝裕和')
    assert.equal(calls.length, 1, 'one request for a film')
    assert.ok(!calls.some(url => url.includes('/tv/')))
  }
  {
    // A book still reads its author off `author`, not `directors`.
    stub([
      ['/book/3057333', { title: '城南旧事', author: ['林海音'], pubdate: ['1960-1'], pic: { large: 'https://img.example/c.jpg' } }],
    ])
    const book = await subjectDetail('book', 3057333)
    assert.equal(book.creator, '林海音')
    assert.equal(book.year, 1960)
  }
  {
    // Nothing answers anywhere: the caller gets null and puts nothing in the
    // author's file, rather than an empty name that looks like an answer.
    stub([])
    assert.equal(await subjectDetail('film', 1234567), null)
  }
}
finally {
  globalThis.fetch = realFetch
}

console.log('douban-detail: ok')
