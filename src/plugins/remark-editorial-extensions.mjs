/**
 * 余白的 Markdown 扩展指令：
 *
 *   ::music{url="https://open.spotify.com/album/..."}
 *   ::music-card{title="..." artist="..." cover="..." type="album" lyric="..." spotify="..."}
 *   ::github{repo="withastro/astro" description="..." stars="..."}
 *   ::embed{url="https://www.youtube.com/watch?v=..." title="..."}
 *
 * 音乐卡片沿用作者现有博客的解析器与卡片结构：Spotify / Apple Music /
 * 网易云 / QQ 音乐自动识别、跨平台匹配，并读取 src/data/music-cache.json
 * 的构建期缓存。卡片 SVG 图标也来自作者原版。
 */

import { resolveMusicUrl } from '../utils/music-resolver.mjs'
import { MUSIC_PLATFORM_META } from './music-platform-icons.mjs'

const MUSIC_TYPES = {
  album: '专辑',
  single: '单曲',
  playlist: '歌单',
  track: '曲目',
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? ''))
}

// The cover is emitted as an escaped <img src>. Keep it https-only and reject
// obvious URL/attribute breakers as defense in depth.
function safeCoverUrl(value) {
  try {
    const url = new URL(String(value ?? ''))
    if (url.protocol !== 'https:') return ''
    if (/["'()\\\s<>]/.test(url.href)) return ''
    return url.href
  }
  catch {
    return ''
  }
}

function sizedCoverUrl(value) {
  const safe = safeCoverUrl(value)
  if (!safe) return ''
  try {
    const url = new URL(safe)
    // NetEase serves a small resized cover for this query parameter. The card
    // is at most ~140px wide, so a 600px source still covers 3x screens.
    if (/^p\d+\.music\.126\.net$/.test(url.hostname)) {
      url.searchParams.set('param', '600y600')
    }
    return url.href
  }
  catch {
    return ''
  }
}

function html(value) {
  return { type: 'html', value }
}

function musicCardHtml({ title, artist, type, cover, lyric, links }) {
  const typeLabel = MUSIC_TYPES[type] || (type === 'album' ? '专辑' : '单曲')
  const coverUrl = sizedCoverUrl(cover)
  const hasCover = Boolean(coverUrl)
  const coverClass = hasCover ? 'mc-cover-wrap' : 'mc-cover-wrap mc-cover-missing'
  const coverHtml = hasCover
    ? `<img src="${esc(coverUrl)}" alt="" width="600" height="600" loading="lazy" decoding="async">`
    : ''

  const linkHtml = Object.entries(MUSIC_PLATFORM_META)
    .map(([key, meta]) => {
      const url = links?.[key]
      if (!isHttpUrl(url)) return ''
      const cls = key === 'qqmusic' ? 'qq' : key
      return `<a href="${esc(url)}" class="mc-link mc-${cls} no-heti" target="_blank" rel="noopener noreferrer"><span class="mc-link__inner">${meta.icon}<span>${esc(meta.label)}</span></span></a>`
    })
    .join('')

  return `
<div class="mc-card"><div class="mc-inner">
  <div class="${coverClass}">${coverHtml}</div>
  <div class="mc-info">
    <span class="mc-type-badge">${typeLabel}</span>
    <p class="mc-title">${esc(title || '未命名')}</p>
    <p class="mc-artist">${esc(artist || '未知艺人')}</p>
    ${lyric ? `<p class="mc-lyric">“${esc(lyric)}”</p>` : ''}
    ${linkHtml ? `<div class="mc-links">${linkHtml}</div>` : ''}
  </div>
</div></div>`
}

async function renderMusic(attrs) {
  const url = attrs.url
  if (!isHttpUrl(url)) {
    return html('<p class="editorial-note">音乐卡片缺少合法的 url 参数。</p>')
  }

  try {
    const info = await resolveMusicUrl(url)
    return html(musicCardHtml({
      title: info.title,
      artist: info.artist,
      type: info.type,
      cover: info.cover,
      links: info.links || {},
    }))
  }
  catch (error) {
    console.warn(`[yohaku] music: ${error.message}`)
    return html(`
<div class="mc-card" style="opacity:0.5">
  <div class="mc-inner" style="justify-content:center;padding:20px;text-align:center">
    <div class="mc-info">
      <p class="mc-title" style="font-size:0.85rem;white-space:normal;margin:0">${esc(url)}</p>
      <p class="mc-artist" style="margin:4px 0 0;font-size:0.7rem">Failed to load music info</p>
    </div>
  </div>
</div>`)
  }
}

function renderManualMusicCard(attrs) {
  const title = attrs.title
  const artist = attrs.artist
  if (!title || !artist) {
    return html('<p class="editorial-note">music-card 至少需要 title 和 artist。</p>')
  }
  const type = attrs.type === 'album' ? 'album' : 'single'
  const links = {
    spotify: attrs.spotify,
    apple: attrs.apple,
    netease: attrs.netease,
    qqmusic: attrs.qq,
  }
  return html(musicCardHtml({
    title,
    artist,
    type,
    cover: attrs.cover,
    lyric: attrs.lyric,
    links,
  }))
}

function renderGithub(attrs) {
  const repo = String(attrs.repo ?? '').trim()
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return html('<p class="editorial-note">GitHub 卡片缺少合法的 repo 参数。</p>')
  }
  const description = attrs.description || '正在读取仓库信息…'
  const stars = attrs.stars || '—'
  const forks = attrs.forks || '—'
  const language = attrs.language || '—'

  return html(`
<a class="github-card" href="https://github.com/${esc(repo)}" target="_blank" rel="noopener noreferrer" data-github-card data-repo="${esc(repo)}">
  <span class="github-card__eyebrow">GitHub <span aria-hidden="true">↗</span></span>
  <span class="github-card__repo">${esc(repo)}</span>
  <span class="github-card__desc" data-gh-desc>${esc(description)}</span>
  <span class="github-card__meta">
    <span>Stars <b data-gh-stars>${esc(stars)}</b></span>
    <span>Forks <b data-gh-forks>${esc(forks)}</b></span>
    <span>Language <b data-gh-language>${esc(language)}</b></span>
  </span>
</a>`)
}

function detectEmbed(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  }
  catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  const path = url.pathname
  const isHost = domain => host === domain || host.endsWith(`.${domain}`)

  if (host === 'youtu.be') {
    const id = path.split('/').filter(Boolean)[0]
    if (id) return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}` }
  }
  if (isHost('youtube.com')) {
    const id = url.searchParams.get('v')
      || path.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1]
    if (id) return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}` }
  }
  if (isHost('bilibili.com')) {
    const match = path.match(/\/video\/(BV[\w]+|av\d+)/)
    if (match) {
      const id = match[1]
      const query = id.startsWith('BV') ? `bvid=${id}` : `aid=${id.slice(2)}`
      return { provider: 'Bilibili', src: `https://player.bilibili.com/player.html?${query}&high_quality=1` }
    }
  }
  if (host === 'open.spotify.com') {
    const match = path.match(/\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/)
    if (match) {
      return { provider: 'Spotify', src: `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator` }
    }
  }
  if (host === 'vimeo.com') {
    const id = path.split('/').filter(Boolean)[0]
    if (/^\d+$/.test(id ?? '')) return { provider: 'Vimeo', src: `https://player.vimeo.com/video/${id}` }
  }
  return null
}

function renderEmbed(attrs) {
  const rawUrl = attrs.url || ''
  if (!isHttpUrl(rawUrl)) {
    return html('<p class="editorial-note">媒体嵌入缺少合法的 url 参数。</p>')
  }
  const detected = detectEmbed(rawUrl)
  const title = attrs.title || '播放媒体'
  const caption = attrs.caption ? `<p class="embed-card__caption">${esc(attrs.caption)}</p>` : ''

  if (!detected) {
    return html(`
<aside class="embed-card embed-card--link">
  <a href="${esc(rawUrl)}" target="_blank" rel="noopener noreferrer">
    <span class="embed-card__eyebrow">外部媒体 ↗</span>
    <span class="embed-card__title">${esc(title)}</span>
  </a>
  ${caption}
</aside>`)
  }

  return html(`
<figure class="embed-card">
  <iframe
    src="${esc(detected.src)}"
    title="${esc(`${detected.provider}：${title}`)}"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
  ${caption}
</figure>`)
}

async function renderDirective(node) {
  const attrs = node.attributes ?? {}
  switch (node.name) {
    case 'music':
      return await renderMusic(attrs)
    case 'music-card':
      return renderManualMusicCard(attrs)
    case 'github':
      return renderGithub(attrs)
    case 'embed':
      return renderEmbed(attrs)
    default:
      return null
  }
}

export function remarkEditorialExtensions() {
  return async (tree) => {
    async function transform(node) {
      if (node.type === 'leafDirective') {
        const rendered = await renderDirective(node)
        if (rendered) return rendered
      }
      if (node.children) {
        node.children = await Promise.all(node.children.map(transform))
      }
      return node
    }
    await transform(tree)
  }
}