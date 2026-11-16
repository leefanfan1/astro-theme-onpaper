/**
 * Where a shelf cover may come from, and what to ask it for.
 *
 * Kept separate from fetch-covers.mjs because these are pure string rules —
 * which hosts are allowed, how to request the large version — and they are
 * the security boundary for a script that writes files into public/. The rest
 * of that script is network and image work.
 */

/** Douban's image hosts, and only those. */
export function isDoubanImage(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^img\d*\.doubanio\.com$/.test(url.hostname)
  }
  catch { return false }
}

/** NetEase's CDN. Its images answer a foreign referrer, so they can be
 * fetched directly; they are still downloaded, for one cache and one origin. */
export function isNeteaseImage(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^p\d+\.music\.126\.net$/.test(url.hostname)
  }
  catch { return false }
}

/**
 * Ask Douban's image host for the largest size of a cover. The subject page
 * and the suggest API both hand back thumbnails.
 */
export function largeCover(url) {
  return url
    .replace('/view/subject/s/public/', '/view/subject/l/public/')
    .replace('/view/subject/m/public/', '/view/subject/l/public/')
    .replace('/view/photo/s_ratio_poster/public/', '/view/photo/l/public/')
    .replace('/view/photo/m_ratio_poster/public/', '/view/photo/l/public/')
    .replace(/^http:/, 'https:')
}

/**
 * NetEase serves a resized copy for a query parameter. The resolver hands back
 * a URL with no size on it (and sometimes one with another size already), and
 * the wall shows a record's cover about 170px wide, so 500px covers a 2x
 * screen with room to spare.
 */
export function neteaseCover(url, size = 500) {
  if (!isNeteaseImage(url)) return ''
  const sized = new URL(url)
  sized.search = `?param=${size}y${size}`
  return sized.href
}

/** A cover that is a file this repo serves itself. */
export function isLocalCover(value) {
  return /^\/shelf\/[a-z0-9]+\.jpg$/.test(String(value ?? ''))
}
