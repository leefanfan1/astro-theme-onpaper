/**
 * Where a shelf card's cover image comes from.
 *
 * Used by /shelf/ and by the per-shelf pages (which paginate), so it lives in
 * one place: three copies of this lookup would drift, and the fallbacks are
 * easy to get subtly wrong.
 */
import musicCache from '@/data/music-cache.json'
import coverCache from '@/data/shelf-covers.json'
import type { ShelfItem } from '@/utils/shelf'

const cache = musicCache as Record<string, { cover?: string }>
const covers = coverCache as Record<string, string>

/**
 * In order: the item's own `封面`, the file `npm run covers` saved, the music
 * cache for records.
 *
 * Every cover `npm run covers` saves is local — Douban's image hosts refuse a
 * request without a Douban referrer, and keeping records' covers here too means
 * one origin, one cache header, and no dependency on a third-party CDN. The
 * remote fallbacks only apply to a repo that has not run it yet.
 */
export function coverOf(item: ShelfItem): string {
  const raw = item.cover
    || covers[`${item.kind}:${item.title}`]
    || (item.kind === 'music' && item.url ? cache[item.url]?.cover : '')
  if (!raw) return ''
  if (raw.startsWith('/')) return raw
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    // A cached NetEase URL from before covers were stored locally.
    if (/^p\d+\.music\.126\.net$/.test(url.hostname)) url.searchParams.set('param', '500y500')
    return url.href
  }
  catch {
    return ''
  }
}

/** The colour a typeset cover uses, cycling so neighbours never match. */
export function inkOf(index: number): number {
  return index % 6
}

/** How each shelf names the maker, after the creator's name. */
export const VERB: Record<ShelfItem['kind'], string> = {
  book: '著',
  film: '导演',
  music: '',
}

/** The measure word for a count of works on a shelf. */
export const COUNT_WORD: Record<ShelfItem['kind'], string> = {
  book: '本',
  film: '部',
  music: '张',
}

/** How many cards one page of a shelf shows. Not a multiple of the six ink
 *  colours, so a page does not start on the colour the last one ended beside. */
export const SHELF_PER_PAGE = 25
