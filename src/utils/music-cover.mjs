/**
 * Where a music card's cover is stored, and what the card may display.
 *
 * The card used to hotlink NetEase's CDN. `npm run music` now downloads the
 * cover instead, and public/_headers marks /music/* immutable — so the name
 * carries the size, a re-run rewrites the same file, and changing the size
 * produces new files rather than retitling images a cache already holds.
 *
 * These are pure string rules and they are also the security boundary for a
 * script that writes into public/: a URL an API hands back is not trusted to
 * be an image, so only the three image hosts below are ever downloaded from.
 */
import { createHash } from 'node:crypto'

/** How large a copy the card asks for: it draws ~136px, so 600px covers 3x. */
export const CARD_COVER_SIZE = 600

/**
 * The storage path for a record's cover. `size` is part of the name so a
 * change of size cannot leave an immutable cache pointing at an old cut.
 */
export function musicCoverName(url, size = CARD_COVER_SIZE) {
  const hash = createHash('sha256').update(`${url}\n${size}`).digest('hex').slice(0, 12)
  return `/music/${hash}.jpg`
}

/**
 * The URL to download a cover from, at `size`, or '' when this is not a host
 * worth asking. NetEase and Apple both serve a resized copy for a parameter or
 * a path segment; Spotify's CDN hands back one size, so it is left alone.
 */
export function musicCoverSource(value, size = CARD_COVER_SIZE) {
  let url
  try {
    url = new URL(String(value ?? ''))
  }
  catch {
    return ''
  }
  if (url.protocol !== 'https:') return ''
  if (url.username || url.password || url.port) return ''

  const host = url.hostname.toLowerCase()
  if (/^p\d+\.music\.126\.net$/.test(host)) {
    url.search = `?param=${size}y${size}`
    return url.href
  }
  if (/^is\d+-ssl\.mzstatic\.com$/.test(host)) {
    // Apple encodes the size in the path: .../100x100bb.jpg
    url.pathname = url.pathname.replace(/\d+x\d+bb/, `${size}x${size}bb`)
    return url.href
  }
  if (host === 'i.scdn.co') return url.href
  return ''
}

/**
 * What the card should put in `<img src>`: a local file the script saved, a
 * local file the author named, or — when nothing has been downloaded yet — the
 * remote cover, sized. Anything else yields '' and the card draws no picture.
 */
export function cardCoverUrl(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  if (raw.startsWith('/')) {
    // A path under public/music/ or public/shelf/: the name `npm run music`
    // generates, or one the author put there by hand.
    if (/^\/music\/[\w-]+\.jpg$/.test(raw)) return raw
    if (/^\/shelf\/[\w-]+\.jpg$/.test(raw)) return raw
    return ''
  }
  let url
  try {
    url = new URL(raw)
  }
  catch {
    return ''
  }
  if (url.protocol !== 'https:') return ''
  // Defense in depth: the value is escaped into an attribute, and a URL that
  // cannot carry a quote or a space cannot break out of one.
  if (/["'()\s<>]/.test(url.href)) return ''
  return musicCoverSource(url.href, CARD_COVER_SIZE) || url.href
}
