/**
 * Download a card's cover and store it under public/music/.
 *
 * The card used to hotlink NetEase's CDN. Storing the file here gives one
 * origin for the page, the immutable cache header public/_headers sets for
 * /music/*, and a cover that cannot break when an image host changes its
 * rules. Only the hosts `musicCoverSource` accepts are ever fetched.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'
import { CARD_COVER_SIZE, musicCoverName, musicCoverSource } from '../src/utils/music-cover.mjs'

const TIMEOUT = 12000

/**
 * @param info  A cache entry. On success `info.coverFile` holds the path the
 *              card should use; on failure it is left as it was, and the card
 *              falls back to the remote cover.
 * @returns The path saved, or '' when nothing was saved.
 */
export async function storeMusicCover(info) {
  if (!info?.cover) return ''
  const source = musicCoverSource(info.cover, CARD_COVER_SIZE)
  if (!source) return ''

  const name = musicCoverName(source, CARD_COVER_SIZE)
  const file = path.resolve(process.cwd(), 'public' + name)
  // A stable name means a re-run costs no request.
  if (info.coverFile === name && existsSync(file)) return name

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  let bytes
  let type
  try {
    const response = await fetch(source, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; onpaper-build)', Accept: 'image/*' },
      // A redirect could leave the allowlist, so none is followed.
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`image ${response.status}`)
    type = response.headers.get('content-type') ?? ''
    // NetEase labels its JPEGs `image/jpg`, which is not the registered type.
    if (!/^image\/(jpe?g|png|webp)/.test(type)) throw new Error(`unexpected image type ${type}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  finally {
    clearTimeout(timer)
  }
  if (bytes.byteLength < 2048 || bytes.byteLength > 8 * 1024 * 1024) throw new Error('image size out of range')

  // The card draws the cover about 136px wide; a 600px square covers a 3x
  // screen, and re-encoding trims whatever the source padded.
  const reencoded = await sharp(bytes)
    .rotate()
    .resize({ width: CARD_COVER_SIZE, height: CARD_COVER_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer()

  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, reencoded)
  info.coverFile = name
  return name
}
