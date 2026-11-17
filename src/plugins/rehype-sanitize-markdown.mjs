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
 * extensions emit (music / GitHub / embed cards), Mermaid's container, and
 * ordinary prose markup. No event handlers, no `<script>`, and iframes only
 * from the four embed providers the CSP also names.
 *
 * Inline `style` is allowed, because a writer colours or centres a line that
 * way and CSS has no other spelling — but only through rehypeStyleAllowlist
 * below, which keeps a declaration only when its property is known and its
 * value matches that property's shape. See the note there.
 *
 * The order this runs in matters and lives in markdown-pipeline.mjs: the
 * sanitizer sees the author's HTML, and the markup KaTeX, Mermaid and the
 * footnote repair add afterwards is the theme's own and is not re-checked.
 */
import { defaultSchema } from 'rehype-sanitize'
import { visit } from 'unist-util-visit'

// Classes the theme's plugins and CSS rely on.
//
// A class list alone is not enough, because two of the things in the tree are
// open-ended. Shiki emits a class per grammar scope (`keyword`, `variable`,
// `punctuator`, …) and the set differs per grammar and theme, so no fixed list
// can hold them; and an author may reasonably want a class of their own for a
// stylesheet of theirs to reach. Hence the pattern — a lowercase name — beside
// the list. An unknown class is inert; a dropped one silently unstyles a code
// block, which is what happened while this was a fixed list only.
const OPEN_CLASS = /^[a-z][\w-]*$/
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
  // GFM's footnotes: the reference link, the back-reference, the section.
  'data-footnote-backref', 'data-footnote-ref',
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

/**
 * CSS properties a post may set inline, and the value each may take.
 *
 * The theme allows `style` because that is how a writer colours or centres a
 * line — `<span style="color:red">` — and CSS has no other way to say it. It
 * is not an open door: `url()` can exfiltrate, `expression()` is script,
 * `@import` pulls a stylesheet, and a positioned full-screen box is
 * clickjacking. So a declaration is kept only if its property is listed here
 * and its value matches that property's pattern; everything else is dropped
 * with the rest of its declaration, quietly.
 *
 * The sanitizer's own `style` entry is a coarse guard that keeps anything
 * obviously dangerous out of the tree at all. This list is the real filter,
 * and it runs afterwards (see rehypeStyleAllowlist).
 */
const CSS_VALUES = {
  color: /^[#a-z0-9().,%\s-]+$/i,
  'background-color': /^[#a-z0-9().,%\s-]+$/i,
  'font-weight': /^(?:normal|bold|bolder|lighter|[1-9]00)$/i,
  'font-style': /^(?:normal|italic|oblique)$/i,
  'font-size': /^[a-z0-9.%\s-]+$/i,
  'font-family': /^[a-z0-9\s,'"-]+$/i,
  'text-align': /^(?:left|right|center|justify|start|end)$/i,
  'text-decoration': /^[a-z\s-]+$/i,
  'text-indent': /^[a-z0-9.%\s-]+$/i,
  'letter-spacing': /^[a-z0-9.%-]+$/i,
  'line-height': /^[a-z0-9.%\s-]+$/i,
  'vertical-align': /^[a-z0-9.%\s-]+$/i,
  'white-space': /^(?:normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/i,
  'overflow-x': /^(?:auto|hidden|scroll|visible|clip)$/i,
  'overflow-wrap': /^(?:normal|break-word|anywhere)$/i,
  'word-wrap': /^(?:normal|break-word)$/i,
  width: /^[a-z0-9.%\s-]+$/i,
  height: /^[a-z0-9.%\s-]+$/i,
  'max-width': /^[a-z0-9.%\s-]+$/i,
  'min-width': /^[a-z0-9.%\s-]+$/i,
  opacity: /^(?:0?\.[0-9]+|0|1)$/,
  // Shiki writes its light/dark pair as custom properties on the block.
  '--shiki-dark': /^[#a-z0-9().,%\s-]+$/i,
  '--shiki-dark-bg': /^[#a-z0-9().,%\s-]+$/i,
}

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
      ['className', OPEN_CLASS, ...CLASS_NAMES],
      'id',
      // Let through here, filtered by rehypeStyleAllowlist below: the schema
      // cannot express "this property, with this value shape".
      'style',
      'dataLanguage',
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
      ['className', ...CLASS_NAMES],
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
 * Filter every inline `style` down to the declarations a post may set.
 *
 * Runs after rehype-sanitize, which has already let `style` through and removed
 * the obviously dangerous values. What remains is parsed declaration by
 * declaration: an unknown property or a value that does not match its
 * property's pattern is dropped, and the ones that survive are written back in
 * a normalised form. A block whose declarations all fail loses the attribute.
 */
// Constructs that turn a value into code or a request. Checked before the
// per-property pattern, because a pattern that allows parentheses and letters
// (a colour can be `rgba(…)`) would otherwise let these through.
const CSS_DANGEROUS = /(?:expression\s*\(|url\s*\(|@import|javascript:|vbscript:|behavior\s*:|\[0-9a-f]{1,6}|-moz-binding)/i

export function rehypeStyleAllowlist() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      const raw = node.properties?.style
      if (typeof raw !== 'string') return
      const kept = []
      for (const declaration of raw.split(';')) {
        const at = declaration.indexOf(':')
        if (at < 0) continue
        const property = declaration.slice(0, at).trim().toLowerCase()
        const value = declaration.slice(at + 1).trim()
        if (!property || !value) continue
        if (CSS_DANGEROUS.test(value) || CSS_DANGEROUS.test(property)) continue
        const pattern = CSS_VALUES[property]
        if (!pattern || !pattern.test(value)) continue
        kept.push(`${property}:${value}`)
      }
      if (kept.length) node.properties.style = kept.join(';')
      else delete node.properties.style
    })
  }
}

/**
 * Put GFM's footnote ids back to a single `user-content-` prefix.
 *
 * mdast-util-to-hast names a footnote `fn-1` and its reference `fnref-1`, and
 * the sanitizer prefixes every id it keeps, producing `user-content-fn-1`. The
 * ids a footnote link points at are written as fragment hrefs — `#fn-1` — and
 * the sanitizer prefixes those too, so both halves agree. But the footnote
 * plugin has already emitted the reference's `id` as `fnref-1` **and** the
 * sanitizer prefixes it, giving `user-content-user-content-fnref-1`: the
 * back-reference then points at an id nothing has.
 *
 * This collapses a doubled prefix to one, on ids and on the hrefs that name
 * them, so the note and its back-link land on each other.
 */
export function rehypeRestoreFootnoteIds() {
  return (tree) => {
    const collapse = value => String(value).replace(/^user-content-user-content-/, 'user-content-')
    visit(tree, 'element', (node) => {
      const properties = node.properties ?? {}
      if (typeof properties.id === 'string') properties.id = collapse(properties.id)
      for (const name of ['ariaDescribedBy', 'ariaLabelledBy']) {
        const value = properties[name]
        if (typeof value === 'string') properties[name] = collapse(value)
        else if (Array.isArray(value)) properties[name] = value.map(collapse)
      }
      if (typeof properties.href === 'string' && properties.href.startsWith('#')) {
        properties.href = '#' + collapse(properties.href.slice(1))
      }
    })
  }
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
