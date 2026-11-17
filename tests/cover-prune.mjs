/**
 * Covers the shelf no longer points at.
 *
 * `npm run covers` only ever added: deleting a book from books.md left its
 * image in public/shelf/ and its line in src/data/shelf-covers.json forever.
 * These cases pin what a run removes — and, more importantly, what it must
 * leave alone: a file the author put there, a cover a hand-written 封面： line
 * still names, and everything at all when a shelf file could not be read.
 */
import assert from 'node:assert/strict'
import { planMusicPrune, planShelfPrune } from '../scripts/cover-prune.mjs'

const generated = 'd25447b49290.jpg' // what the script names a cover
const generatedUnused = 'aaaaaaaaaaaa.jpg'

{
  // Deleting an entry drops its cache line and its image, keeps the rest.
  const plan = planShelfPrune({
    complete: true,
    entries: [{ kind: 'music', title: '十年自选', cover: '' }],
    covers: {
      'music:城市': `/shelf/${generated}`,
      'music:十年自选': `/shelf/${generatedUnused}`,
    },
    files: [generated, generatedUnused],
  })
  assert.deepEqual(plan.covers, { 'music:十年自选': `/shelf/${generatedUnused}` })
  assert.deepEqual(plan.remove, [generated])
  assert.deepEqual(plan.kept, [])
}

{
  // A cover the entry itself names is a reference, even though no cache line
  // holds it — and a file whose name the script did not generate is never its
  // to delete.
  const plan = planShelfPrune({
    complete: true,
    entries: [{ kind: 'book', title: '城南旧事', cover: '/shelf/myscan.jpg' }],
    covers: {},
    files: ['myscan.jpg', 'someone-elses.jpg', generatedUnused],
  })
  // The author's own file stays; the generated one nothing references goes.
  assert.deepEqual(plan.remove, [generatedUnused])
  assert.deepEqual(plan.kept, ['myscan.jpg', 'someone-elses.jpg'])
  assert.deepEqual(plan.covers, {})
}

{
  // A generated file still named by a kept cache line stays.
  const plan = planShelfPrune({
    complete: true,
    entries: [{ kind: 'book', title: '城南旧事', cover: '' }],
    covers: { 'book:城南旧事': `/shelf/${generated}` },
    files: [generated],
  })
  assert.deepEqual(plan.remove, [])
  assert.deepEqual(plan.covers, { 'book:城南旧事': `/shelf/${generated}` })
}

{
  // An entry that exists but has no cover yet must not cost anyone else's.
  const plan = planShelfPrune({
    complete: true,
    entries: [{ kind: 'film', title: '一一', cover: '' }],
    covers: {},
    files: [generated],
  })
  assert.deepEqual(plan.remove, [generated])
}

{
  // Anything that is not a name this script produces is out of scope, whatever
  // the cache says about it.
  const plan = planShelfPrune({
    complete: true,
    entries: [],
    covers: { 'book:旧书': '/shelf/hand-picked.jpg' },
    files: ['hand-picked.jpg', 'cover.jpg'],
  })
  assert.deepEqual(plan.covers, {})
  assert.deepEqual(plan.remove, [])
}

{
  // A shelf file that could not be read means the list of live entries is not
  // trustworthy: remove nothing, change nothing.
  const plan = planShelfPrune({
    complete: false,
    reason: 'books.md could not be read',
    entries: [],
    covers: { 'music:城市': `/shelf/${generated}` },
    files: [generated, generatedUnused],
  })
  assert.deepEqual(plan.covers, { 'music:城市': `/shelf/${generated}` })
  assert.deepEqual(plan.remove, [])
  assert.equal(typeof plan.skipped, 'string')
}

{
  // What a run reports: which title lost which picture, for the log.
  const plan = planShelfPrune({
    complete: true,
    entries: [],
    covers: { 'music:城市': `/shelf/${generated}` },
    files: [generated],
  })
  assert.deepEqual(plan.dropped, [{ key: 'music:城市', cover: `/shelf/${generated}` }])
}

{
  // Music covers live in their own folder, and what keeps one is a URL a post
  // still writes in ::music{...}. A cache entry nobody asks for any more is
  // not a reference: the card it belonged to is gone from the Markdown.
  const plan = planMusicPrune({
    urls: ['https://open.spotify.com/album/1'],
    cache: {
      'https://open.spotify.com/album/1': { cover: 'https://p1.music.126.net/a.jpg', coverFile: '/music/0123456789ab.jpg' },
      'https://open.spotify.com/album/gone': { cover: 'https://p1.music.126.net/b.jpg', coverFile: '/music/ffffffffffff.jpg' },
    },
    files: ['0123456789ab.jpg', 'ffffffffffff.jpg', 'eeeeeeeeeeee.jpg', 'notes.txt'],
  })
  assert.deepEqual(plan.remove, ['eeeeeeeeeeee.jpg', 'ffffffffffff.jpg'])
  // Without a trustworthy list of live URLs, nothing goes.
  const skipped = planMusicPrune({
    urls: null,
    reason: 'src/content could not be read',
    cache: { 'https://open.spotify.com/album/1': { coverFile: '/music/0123456789ab.jpg' } },
    files: ['eeeeeeeeeeee.jpg'],
  })
  assert.deepEqual(skipped.remove, [])
  assert.equal(typeof skipped.skipped, 'string')
}

console.log('cover-prune: ok')
