/**
 * 余白的 Markdown 扩展指令：
 *
 *   ::music{url="https://open.spotify.com/album/..."}
 *   ::music-card{title="..." artist="..." cover="..." type="album" lyric="..." spotify="..."}
 *   ::github{repo="withastro/astro" description="..." stars="..."}
 *   ::embed{url="https://www.youtube.com/watch?v=..." title="..."}
 *
 * 音乐卡片沿用作者现有博客的解析器：Spotify / Apple Music / 网易云 / QQ 音乐
 * 自动识别、跨平台匹配，并读取 src/data/music-cache.json 的构建期缓存。
 * 卡片外观则重新设计成余白的 Claude 风格。
 */

import { resolveMusicUrl } from '../utils/music-resolver.mjs'

const MUSIC_PLATFORMS = [
  ['spotify', 'Spotify', '#1DB954'],
  ['apple', 'Apple Music', '#FA243C'],
  ['netease', '网易云音乐', '#E72D2C'],
  ['qqmusic', 'QQ 音乐', '#02B053'],
]

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

function html(value) {
  return { type: 'html', value }
}

function musicCardHtml({ title, artist, type, cover, lyric, links }) {
  const typeLabel = MUSIC_TYPES[type] || (type === 'album' ? '专辑' : '单曲')
  const initial = Array.from(title || '♪')[0] || '♪'
  const coverHtml = isHttpUrl(cover)
    ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<span class="music-card__initial" aria-hidden="true">${esc(initial)}</span>`

  const linkHtml = MUSIC_PLATFORMS
    .filter(([key]) => isHttpUrl(links?.[key]))
    .map(([key, label, color]) => `<a class="music-card__link" style="--dot:${color}" href="${esc(links[key])}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`)
    .join('')

  return `
<aside class="music-card">
  <div class="music-card__cover">${coverHtml}</div>
  <div class="music-card__body">
    <p class="music-card__eyebrow">${typeLabel}</p>
    <p class="music-card__title">${esc(title || '未命名')}</p>
    <p class="music-card__artist">${esc(artist || '未知艺人')}</p>
    ${lyric ? `<p class="music-card__lyric">“${esc(lyric)}”</p>` : ''}
    ${linkHtml ? `<div class="music-card__links">${linkHtml}</div>` : ''}
  </div>
</aside>`
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
      lyric: attrs.lyric,
      links: info.links || {},
    }))
  }
  catch (error) {
    console.warn(`[yohaku] music: ${error.message}`)
    return html(`
<aside class="music-card music-card--error">
  <div class="music-card__cover"><span class="music-card__initial" aria-hidden="true">♪</span></div>
  <div class="music-card__body">
    <p class="music-card__eyebrow">音乐</p>
    <p class="music-card__title">暂时读不到这张唱片</p>
    <a class="music-card__link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">打开链接 <span aria-hidden="true">↗</span></a>
  </div>
</aside>`)
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

  if (host === 'youtu.be') {
    const id = path.split('/').filter(Boolean)[0]
    if (id) return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` }
  }
  if (host.endsWith('youtube.com')) {
    const id = url.searchParams.get('v')
      || path.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1]
    if (id) return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` }
  }
  if (host.endsWith('bilibili.com')) {
    const match = path.match(/\/video\/(BV[\w]+|av\d+)/)
    if (match) {
      const id = match[1]
      const query = id.startsWith('BV') ? `bvid=${id}` : `aid=${id.slice(2)}`
      return { provider: 'Bilibili', src: `https://player.bilibili.com/player.html?${query}&autoplay=1&high_quality=1` }
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
    if (/^\d+$/.test(id ?? '')) return { provider: 'Vimeo', src: `https://player.vimeo.com/video/${id}?autoplay=1` }
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
<figure class="embed-card" data-embed data-src="${esc(detected.src)}">
  <button class="embed-card__poster" type="button" aria-label="播放：${esc(title)}">
    <span class="embed-card__eyebrow">${esc(detected.provider)} · 点击播放</span>
    <span class="embed-card__title">${esc(title)}</span>
    <span class="embed-card__play" aria-hidden="true"></span>
  </button>
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