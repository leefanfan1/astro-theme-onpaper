/**
 * What a post's Markdown becomes.
 *
 * These cases exist because the pipeline used to run the author's sanitizer
 * over markup the theme itself generates. A coloured span lost its `style`, a
 * highlighted code block lost every class, KaTeX lost its positioning, a
 * ```mermaid block was never recognised, and a footnote's back-reference
 * pointed at an id that did not exist. Each was silent: the page built, the
 * text was there, and only the styling was gone.
 *
 * The processor is built from src/plugins/markdown-pipeline.mjs — the same
 * lists astro.config.mjs hands Astro — so these cases describe the chain the
 * site runs rather than a copy of it. Shiki is Astro's own step and is not part
 * of this call; the code-block case below therefore checks the class allowlist
 * against a hand-built shiki-shaped tree instead.
 */
import assert from 'node:assert/strict'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import rehypeSanitize from 'rehype-sanitize'
import { rehypePlugins, remarkPlugins } from '../src/plugins/markdown-pipeline.mjs'
import { sanitizeSchema } from '../src/plugins/rehype-sanitize-markdown.mjs'

const processor = await createMarkdownProcessor({ remarkPlugins, rehypePlugins })
const render = async md => (await processor.render(md)).code

// ── Markdown that must keep working ─────────────────────────────────────────

{
  const html = await render('**粗** *斜* ~~删~~ `码`\n\n- a\n- [x] b\n\n1. 一\n\n> 引用\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
  for (const tag of ['<strong', '<em', '<del', '<code', '<ul', '<ol', '<blockquote', '<table', 'task-list-item']) {
    assert.ok(html.includes(tag), `${tag} survives`)
  }
}

// ── the author's own HTML ───────────────────────────────────────────────────

{
  // A colour is what `style` is for; the theme allows it.
  const html = await render('<span style="color:red;font-weight:bold">红</span>\n')
  assert.match(html, /<span style="color:red;font-weight:bold">红<\/span>/)
  // …on a block of the author's too, not only a span.
  assert.match(await render('<div style="text-align:center">居中</div>\n'), /style="text-align:center"/)
}
{
  // A declaration that could exfiltrate or cover the page is dropped, and the
  // rest of that element's style survives.
  const html = await render('<span style="color:red;position:fixed;background:url(https://evil/x)">x</span>\n')
  assert.match(html, /style="color:red"/)
  assert.doesNotMatch(html, /position/)
  assert.doesNotMatch(html, /url\(/)
  assert.doesNotMatch(html, /evil/)
}
{
  // Unknown properties go; a value shaped wrong for a known one goes too.
  const html = await render('<span style="color:expression(alert(1));width:100%">x</span>\n')
  assert.doesNotMatch(html, /expression/)
  assert.match(html, /width:100%/)
}
{
  // The sanitizer still does its job: no script, no handlers.
  const html = await render('<script>alert(1)</script>\n\n<span onclick="alert(1)">on</span>\n')
  assert.doesNotMatch(html, /<script/)
  assert.doesNotMatch(html, /onclick/)
  assert.match(html, /<span>on<\/span>/)
}
{
  // An iframe from a host the CSP does not name is not left as a frame.
  const html = await render('<iframe src="https://evil.example/x"></iframe>\n')
  assert.doesNotMatch(html, /<iframe/)
}
{
  // Prose markup the author reaches for is kept.
  const html = await render('<mark>亮</mark> <kbd>Ctrl</kbd> <sup>上</sup> <del>删</del>\n\n<details><summary>标题</summary>内容</details>\n')
  for (const tag of ['<mark', '<kbd', '<sup', '<del', '<details', '<summary']) {
    assert.ok(html.includes(tag), `${tag} survives`)
  }
}

// ── the theme's own generated markup ────────────────────────────────────────

{
  // A ```mermaid fence becomes the container the browser script looks for,
  // and its source survives as text rather than as highlighted spans.
  const html = await render('```mermaid\ngraph TD;\n  A-->B\n```\n')
  assert.match(html, /<pre class="mermaid">graph TD;\s+A-->B<\/pre>/)
}
{
  // KaTeX's classes are generated wholesale, so the sanitizer must not be run
  // over them; they stay as rehype-katex wrote them.
  const html = await render('公式 $E=mc^2$\n')
  assert.match(html, /class="katex"/)
  assert.match(html, /katex-mathml/)
  assert.match(html, /katex-html/)
  assert.match(html, /<math /)
}
{
  // A shiki block: what the highlighter emits has to survive the allowlist.
  // Built by hand because shiki is Astro's step, not one of ours.
  const tree = {
    type: 'root',
    children: [{
      type: 'element',
      tagName: 'pre',
      properties: { className: ['astro-code', 'astro-code-themes', 'github-light-high-contrast'], style: 'background-color:#fff;--shiki-dark-bg:#0a0c10;color:#0e1116;--shiki-dark:#f0f3f6;overflow-x:auto;white-space:pre-wrap', tabIndex: 0, dataLanguage: 'js' },
      children: [{
        type: 'element',
        tagName: 'code',
        properties: {},
        children: [{
          type: 'element',
          tagName: 'span',
          properties: { className: ['line'] },
          children: [{ type: 'element', tagName: 'span', properties: { className: ['token', 'keyword', 'variable'] }, children: [{ type: 'text', value: 'const' }] }],
        }],
      }],
    }],
  }
  const sanitized = rehypeSanitize(sanitizeSchema)(tree) ?? tree
  const classes = []
  const collect = node => {
    for (const name of node.properties?.className ?? []) classes.push(String(name))
    for (const child of node.children ?? []) collect(child)
  }
  collect(sanitized)
  for (const name of ['astro-code', 'line', 'token', 'keyword', 'variable']) {
    assert.ok(classes.includes(name), `shiki class "${name}" survives`)
  }
  assert.equal(sanitized.children[0].properties.dataLanguage, 'js', 'data-language survives')
}

// ── footnotes ───────────────────────────────────────────────────────────────

{
  // The back-reference has to point at the reference, and the note's id has to
  // match the href that leads there. A doubled `user-content-` prefix broke
  // both silently.
  const html = await render('脚注[^1]\n\n[^1]: 内容\n')
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1])
  const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1])
  assert.ok(ids.includes('user-content-fn-1'), 'the note keeps one prefix')
  assert.ok(ids.includes('user-content-fnref-1'), 'the reference keeps one prefix')
  for (const href of hrefs) {
    assert.ok(ids.includes(href), `#${href} lands on an id that exists`)
  }
  assert.doesNotMatch(html, /user-content-user-content-/)
}

console.log('markdown-render: ok')
