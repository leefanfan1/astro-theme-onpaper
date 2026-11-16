/**
 * Covers are written into public/ and then served by this site, so the script
 * that fetches them decides what every later build references. These cases
 * pin the host allowlist (a URL an API hands back is not trusted to be an
 * image), and the sizes asked for — sized to what the wall actually draws.
 */
import assert from 'node:assert/strict'
import { isDoubanImage, isLocalCover, isNeteaseImage, largeCover, neteaseCover } from '../scripts/cover-source.mjs'

{
  assert.equal(isDoubanImage('https://img3.doubanio.com/view/subject/l/public/s123.jpg'), true)
  assert.equal(isDoubanImage('https://img9.doubanio.com/view/photo/l/public/p1.jpg'), true)
  assert.equal(isDoubanImage('http://img3.doubanio.com/view/subject/l/public/s123.jpg'), false)
  assert.equal(isDoubanImage('https://doubanio.com.example/view/subject/l/public/s123.jpg'), false)
  assert.equal(isDoubanImage('https://img3.doubanio.com.evil.test/x.jpg'), false)
  assert.equal(isDoubanImage('not a url'), false)
  // A URL that names doubanio.com in a path or query is not that host.
  assert.equal(isDoubanImage('https://evil.test/img3.doubanio.com/x.jpg'), false)
  assert.equal(isDoubanImage('https://evil.test/?u=img3.doubanio.com'), false)
}
{
  assert.equal(isNeteaseImage('https://p1.music.126.net/abc==/1.jpg'), true)
  assert.equal(isNeteaseImage('https://p2.music.126.net/abc==/1.jpg?param=400y400'), true)
  assert.equal(isNeteaseImage('https://music.126.net/abc==/1.jpg'), false)
  assert.equal(isNeteaseImage('http://p1.music.126.net/abc==/1.jpg'), false)
  assert.equal(isNeteaseImage('https://p1.music.126.net.evil.test/1.jpg'), false)
  assert.equal(isNeteaseImage('https://evil.test/?p1.music.126.net'), false)
}
{
  // The thumbnail subjects come back is replaced with the large version.
  assert.equal(largeCover('https://img3.doubanio.com/view/subject/s/public/s123.jpg'), 'https://img3.doubanio.com/view/subject/l/public/s123.jpg')
  assert.equal(largeCover('https://img3.doubanio.com/view/photo/m_ratio_poster/public/p1.jpg'), 'https://img3.doubanio.com/view/photo/l/public/p1.jpg')
  // A URL with an existing size this function does not know is left alone
  // rather than mangled.
  const unknown = 'https://img3.doubanio.com/view/subject/x/public/s123.jpg'
  assert.equal(largeCover(unknown), unknown)
}
{
  // NetEase: one size, and any size the URL already carried is replaced, so a
  // cached URL from an older run does not pin its dimensions.
  assert.equal(neteaseCover('https://p1.music.126.net/abc==/1.jpg'), 'https://p1.music.126.net/abc==/1.jpg?param=500y500')
  assert.equal(neteaseCover('https://p1.music.126.net/abc==/1.jpg?param=130y130'), 'https://p1.music.126.net/abc==/1.jpg?param=500y500')
  assert.equal(neteaseCover('https://p1.music.126.net/abc==/1.jpg?param=400y400&x=1'), 'https://p1.music.126.net/abc==/1.jpg?param=500y500')
  assert.equal(neteaseCover('https://p1.music.126.net/abc==/1.jpg', 800), 'https://p1.music.126.net/abc==/1.jpg?param=800y800')
  // Not NetEase: no URL at all, rather than a rewritten foreign one.
  assert.equal(neteaseCover('https://evil.test/1.jpg'), '')
  assert.equal(neteaseCover(''), '')
}
{
  assert.equal(isLocalCover('/shelf/5ba81f185e1f.jpg'), true)
  assert.equal(isLocalCover('https://p1.music.126.net/abc==/1.jpg'), false)
  assert.equal(isLocalCover('/shelf/../secret.jpg'), false)
  assert.equal(isLocalCover(''), false)
}

console.log('cover-source: ok')
