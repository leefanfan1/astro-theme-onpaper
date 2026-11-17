/**
 * The music card's cover, stored locally.
 *
 * Two pure rules live in src/utils/music-cover.mjs: where the downloaded copy
 * is written, and which URLs may be downloaded from at all. Both are the
 * security boundary for a script that writes files into public/, and the card
 * has to recognise exactly the paths the script produces — so they are pinned
 * together here.
 */
import assert from 'node:assert/strict'
import { cardCoverUrl, musicCoverName, musicCoverSource } from '../src/utils/music-cover.mjs'

{
  // A stable name per URL and size: a re-run rewrites the same file instead of
  // piling up, and a size change makes a new name (public/_headers marks the
  // folder immutable).
  const name = musicCoverName('https://music.163.com/#/album?id=32312')
  assert.match(name, /^\/music\/[a-f0-9]{12}\.jpg$/)
  assert.equal(name, musicCoverName('https://music.163.com/#/album?id=32312'))
  assert.notEqual(name, musicCoverName('https://music.163.com/#/album?id=286217101'))
  assert.notEqual(name, musicCoverName('https://music.163.com/#/album?id=32312', 900))
  // Whatever the script names is a path the card accepts.
  assert.equal(cardCoverUrl(name), name)
}
{
  // NetEase serves a resized copy for this query parameter; any size the URL
  // already carried is replaced.
  assert.equal(
    musicCoverSource('https://p1.music.126.net/abc==/1.jpg', 600),
    'https://p1.music.126.net/abc==/1.jpg?param=600y600',
  )
  assert.equal(
    musicCoverSource('https://p1.music.126.net/abc==/1.jpg?param=130y130', 600),
    'https://p1.music.126.net/abc==/1.jpg?param=600y600',
  )
  // Apple encodes the size in the path.
  assert.equal(
    musicCoverSource('https://is1-ssl.mzstatic.com/image/thumb/abc/100x100bb.jpg', 600),
    'https://is1-ssl.mzstatic.com/image/thumb/abc/600x600bb.jpg',
  )
  assert.equal(
    musicCoverSource('https://is1-ssl.mzstatic.com/image/thumb/abc/300x300bb.jpg', 600),
    'https://is1-ssl.mzstatic.com/image/thumb/abc/600x600bb.jpg',
  )
  // Spotify's CDN hands back one size, so it is left alone.
  assert.equal(
    musicCoverSource('https://i.scdn.co/image/ab67616d0000b273abc', 600),
    'https://i.scdn.co/image/ab67616d0000b273abc',
  )
}
{
  // Not an image host this script fetches from: no URL at all, rather than a
  // rewritten foreign one.
  assert.equal(musicCoverSource('https://evil.test/1.jpg', 600), '')
  assert.equal(musicCoverSource('https://p1.music.126.net.evil.test/1.jpg', 600), '')
  assert.equal(musicCoverSource('https://evil.test/?p1.music.126.net', 600), '')
  assert.equal(musicCoverSource('http://p1.music.126.net/abc==/1.jpg', 600), '')
  assert.equal(musicCoverSource('', 600), '')
  // A host that serves HTML is not a cover.
  assert.equal(musicCoverSource('https://music.163.com/abc.jpg', 600), '')
}
{
  // The card prefers the local copy, and accepts a path the author wrote.
  assert.equal(cardCoverUrl('/music/0123456789ab.jpg'), '/music/0123456789ab.jpg')
  // A file the author put in public/music/ by hand works as well.
  assert.equal(cardCoverUrl('/music/handpicked.jpg'), '/music/handpicked.jpg')
  assert.equal(cardCoverUrl('/shelf/d25447b49290.jpg'), '/shelf/d25447b49290.jpg')
  // A remote fallback is sized like before.
  assert.equal(
    cardCoverUrl('https://p2.music.126.net/abc==/1.jpg'),
    'https://p2.music.126.net/abc==/1.jpg?param=600y600',
  )
  // Anything else — a relative path out of the asset folders, a non-https URL,
  // a scheme that would run script — yields nothing.
  for (const bad of ['/etc/passwd', '/shelf/../secret.jpg', '/music/x.png', 'cover.jpg',
    'http://p1.music.126.net/abc==/1.jpg', 'javascript:alert(1)', 'data:image/jpeg;base64,AA', '']) {
    assert.equal(cardCoverUrl(bad), '', `should reject ${bad}`)
  }
}

console.log('music-cover: ok')
