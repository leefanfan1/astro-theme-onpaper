/**
 * Sanitise the HTML a post writes inline.
 *
 * `rehype-raw` is enabled so authors can mix HTML into Markdown, which also
 * means a post can contain `<script>`, `onerror=`, `srcdoc` and the like.
 * Astro's router re-executes script nodes after a client-side swap and the
 * site's CSP must allow inline script for Astro's own bootstrap, so raw HTML
 * in a post would run with the page's privileges. On a single-author blog the
 * author is the only one who can write that, but a theme gets forked and
 * handed to other writers — so the pipeline sanitises by default.
 *
 * The allowlist is the theme's own vocabulary: the elements the editorial
 * extensions emit (music / GitHub / embed cards), KaTeX's MathML, Mermaid's
 * container, and ordinary prose markup. No event handlers, no `style`
 * attributes, no `<script>`, and iframes only from the four embed providers
 * the CSP also names.
 */
import { defaultSchema } from 'rehype-sanitize'
import { visit } from 'unist-util-visit'

// Classes the theme's plugins and CSS rely on.
const CLASS_NAMES = [
  'mc-card', 'mc-inner', 'mc-art', 'mc-disc', 'mc-cover-wrap', 'mc-cover-missing', 'mc-info',
  'mc-type-badge', 'mc-title', 'mc-artist', 'mc-lyric', 'mc-links', 'mc-link', 'mc-link__inner',
  'mc-spotify', 'mc-apple', 'mc-netease', 'mc-qqmusic',
  'github-card', 'github-card__head', 'github-card__icon', 'github-card__repo', 'github-card__owner',
  'github-card__slash', 'github-card__name', 'github-card__open', 'github-card__body',
  'github-card__desc', 'github-card__meta', 'github-card__stat', 'github-card__language',
  'embed-card', 'embed-card--link', 'embed-card__frame', 'embed-card__eyebrow', 'embed-card__title',
  'embed-card__caption', 'editorial-note',
  'katex', 'katex-display', 'katex-error', 'mermaid', 'math', 'math-display', 'math-inline',
  'task-list-item', 'contains-task-list', 'footnotes', 'sr-only',
]

const MATHML = [
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
  'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd',
  'mspace', 'mover', 'munder', 'munderover', 'mpadded', 'mphantom', 'menclose', 'maction',
]

// The data-* attributes the theme's own markup and scripts use.
const DATA_ATTRS = [
  'dataProvider', 'dataGithubCard', 'dataRepo', 'dataGhDesc', 'dataGhStars', 'dataGhForks',
  'dataGhLanguage', 'dataViewCount', 'dataSlug', 'dataEmbed', 'dataMusicCard',
  'dataTocLink', 'dataTocChapter', 'dataAstroHistory',
]

const EMBED_SRC = [
  'https://www.youtube-nocookie.com/',
  'https://player.bilibili.com/',
  'https://open.spotify.com/',
  'https://player.vimeo.com/',
]

export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...new Set([
    ...(defaultSchema.tagNames ?? []),
    'figure', 'figcaption', 'aside', 'iframe', 'video', 'audio', 'source', 'picture',
    'mark', 'kbd', 'details', 'summary', 'abbr', 'time', 'del', 'ins', 'sup', 'sub',
    'dl', 'dt', 'dd', 'colgroup', 'col',
    // The music and GitHub cards draw their platform marks as inline SVG.
    'svg', 'path', 'circle', 'rect', 'g', 'line', 'polyline', 'polygon', 'use', 'title',
    ...MATHML,
  ])],
  attributes: {
    ...defaultSchema.attributes,
    // A single class name per entry: hast-util-sanitize matches each token of
    // `className` against the list, so a card with several classes
    // ("github-card github-card--compact") keeps the ones it knows.
    // `data-*` hooks: the GitHub card's stats, the view counter's slug, the
    // embed provider, and the misc attributes the theme's own scripts read.
    // Allowing a fixed list by name, rather than `data-*` by pattern, keeps a
    // post from inventing attributes the scripts might later trust.
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      ['className', ...CLASS_NAMES],
      'id',
      ...DATA_ATTRS,
    ],
    // The card icons: a filled path inside a viewBox-sized svg.
    svg: ['viewBox', 'width', 'height', 'fill', 'xmlns', 'ariaHidden', 'focusable', 'role'],
    path: ['d', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'fillRule', 'clipRule', 'fillOpacity'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke'],
    g: ['fill', 'stroke', 'transform'],
    // The default `a` entry narrows className to its footnote value, which
    // would strip every theme class from a link-shaped card. Restate the
    // allowlist, keeping the footnote entry the schema ships with.
    a: [
      ...(defaultSchema.attributes?.a ?? []).filter(entry => !Array.isArray(entry)),
      ['className', ...CLASS_NAMES, 'data-footnote-backref'],
      'target',
      'rel',
    ],
    iframe: ['src', 'title', 'allow', 'allowFullscreen', 'loading', 'referrerPolicy', 'width', 'height'],
    img: [...(defaultSchema.attributes?.img ?? []), 'loading', 'decoding', 'referrerPolicy', 'width', 'height'],
    source: ['src', 'srcSet', 'type', 'media'],
    video: ['src', 'poster', 'controls', 'loop', 'muted', 'playsInline', 'preload', 'width', 'height'],
    audio: ['src', 'controls', 'loop', 'muted', 'preload'],
    td: [...(defaultSchema.attributes?.td ?? []), 'colSpan', 'rowSpan', 'align'],
    th: [...(defaultSchema.attributes?.th ?? []), 'colSpan', 'rowSpan', 'align', 'scope'],
    ol: [...(defaultSchema.attributes?.ol ?? []), 'start', 'reversed', 'type'],
    figure: [...(defaultSchema.attributes?.figure ?? []), ['className', ...CLASS_NAMES], 'dataProvider'],
    time: ['dateTime'],
    details: ['open'],
    math: ['xmlns', 'display'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
    cite: ['http', 'https'],
  },
}

/**
 * Runs after rehype-sanitize: keeps iframes to the embed providers the CSP
 * allows, and neutralises any `on*` attribute or non-http URL that survived.
 */
export function rehypeEmbedAllowlist() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'iframe') {
        const src = String(node.properties?.src ?? '')
        if (!EMBED_SRC.some(prefix => src.startsWith(prefix))) {
          // Not an allowlisted provider: keep the text, drop the frame.
          node.tagName = 'a'
          node.properties = { href: src, className: ['embed-card__title'] }
          node.children = [{ type: 'text', value: '媒体嵌入' }]
        }
      }
      for (const name of Object.keys(node.properties ?? {})) {
        if (/^on/i.test(name)) { delete node.properties[name]; continue }
        if (name !== 'href' && name !== 'src') continue
        const raw = node.properties[name]
        const value = Array.isArray(raw) ? raw[0] : raw
        let ok = false
        try {
          const { protocol } = new URL(String(value), 'https://example.invalid/')
          ok = protocol === 'http:' || protocol === 'https:'
        }
        catch { ok = false }
        if (!ok) delete node.properties[name]
      }
    })
  }
}
