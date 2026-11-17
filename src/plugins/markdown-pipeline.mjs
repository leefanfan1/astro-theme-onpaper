/**
 * The Markdown pipeline, in one place.
 *
 * astro.config.mjs hands these two lists to Astro, and tests/markdown-render.mjs
 * builds a processor from the same lists — so a test that says "a mermaid block
 * becomes a diagram" is talking about the chain the site actually runs rather
 * than a copy of it that can drift.
 *
 * Astro runs its own plugins first (remark-parse, GFM, the syntax highlighter),
 * then these. The order below follows from three facts:
 *
 * 1. The author's raw HTML is still an unparsed `raw` node when plugins start.
 *    Nothing can inspect or sanitise it until it is elements, so rehype-raw
 *    comes first.
 *
 * 2. rehype-sanitize is for the author's HTML. Everything after it in this list
 *    is a plugin the theme trusts to emit its own markup — KaTeX, Mermaid, the
 *    footnote ids, the task-list labels — and that markup must not be run
 *    through the author's allowlist. Doing so stripped KaTeX's positioning
 *    classes and shiki's token classes, leaving styled blocks unstyled; it is
 *    why a coloured span and a highlighted code block both came out plain.
 *    The exceptions are the theme's own card plugins, whose output is
 *    deliberately in the schema's vocabulary — those run before, and so are
 *    checked.
 *
 * 3. rehype-slug is last, after the sanitizer: hast-util-sanitize prefixes
 *    every `id` it lets through, so heading ids have to be assigned after that
 *    pass to keep their real slugs and keep section links working.
 */
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkDirective from 'remark-directive'
import remarkMath from 'remark-math'
import { rehypeExternalLinks } from './rehype-external-links.mjs'
import { rehypeMermaid } from './rehype-mermaid.mjs'
import {
  rehypeEmbedAllowlist,
  rehypeRestoreFootnoteIds,
  rehypeStyleAllowlist,
  sanitizeSchema,
} from './rehype-sanitize-markdown.mjs'
import { rehypeStripEntities } from './rehype-strip-entities.mjs'
import { rehypeTaskListLabels } from './rehype-task-list-labels.mjs'
import { remarkEditorialExtensions } from './remark-editorial-extensions.mjs'

export const remarkPlugins = [
  remarkDirective,
  remarkMath,
  remarkEditorialExtensions,
]

export const rehypePlugins = [
  // Author HTML becomes elements here, so the sanitizer has something to read.
  rehypeRaw,

  // Hardens the author's links and media: no javascript:/data: URLs, and
  // external links get target/rel. Before the sanitizer, on the parsed HTML.
  rehypeExternalLinks,
  rehypeStripEntities,

  // Before the sanitizer: it rewrites a ```mermaid block into <pre class=
  // "mermaid">, and it needs the block's own classes and data-language to
  // recognise one. Its output is the theme's markup, which the schema knows.
  rehypeMermaid,

  // The author's HTML is checked here and nowhere later.
  [rehypeSanitize, sanitizeSchema],
  // The schema cannot say "this property, with this value shape", so the
  // surviving `style` attributes are filtered declaration by declaration.
  rehypeStyleAllowlist,
  // Keeps iframes to the four CSP hosts, and drops any stray on* handler.
  rehypeEmbedAllowlist,

  // From here on the tree holds markup the theme generated itself.
  rehypeKatex,
  rehypeRestoreFootnoteIds,
  rehypeTaskListLabels,

  // Last, so heading ids keep their real slugs.
  rehypeSlug,
]
