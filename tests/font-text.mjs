import assert from 'node:assert/strict'
import { analyzeFontText } from '../src/plugins/font-text.mjs'

const analyze = (body, css = '', extra = '') => analyzeFontText('<!doctype html><html><head><link rel="stylesheet" href="/theme.css">' + extra + '</head><body>' + body + '</body></html>', new Map([['/theme.css', css]]))
const chars = value => [...new Set(value)].sort((a, b) => a.codePointAt(0) - b.codePointAt(0))

{
  const result = analyze('<div class="post-meta"><time>2026.06.16</time></div><time>ABC</time>', '.post-meta time{font-style:italic}')
  assert.deepEqual(result.italicCharacters, chars('2026.06.16'))
  assert.deepEqual(result.characters, chars('2026.06.16ABC'))
  const generated = analyze('<div class="post-meta"><time>2026.06.16</time></div>', '.post-meta time{font-style:italic}.toc summary:after{content:"+"}.toc[open] summary:after{content:"−"}.prose hr:before{content:"· · ·"}.toc a:before{font-style:italic;content:counter(toc,decimal-leading-zero)}')
  assert.deepEqual(generated.italicCharacters, chars('2026.06.16'))
}
{
  const result = analyze('<em>A<span>B</span></em><i>C</i><cite>D</cite><dfn>E</dfn><var>F</var><address>G</address><span>H</span>')
  assert.deepEqual(result.italicCharacters, chars('ABCDEFG'))
}
{
  const result = analyze('<span style="font-style: oblique 10deg">A<b>B</b><img alt="C"><input placeholder="D" title="E"></span><span style="font:inherit">F</span>')
  assert.deepEqual(result.italicCharacters, chars('ABCDE'))
  assert.deepEqual(result.characters, chars('ABCDEF'))
}
{
  const css = '.timeline-date{font-style:italic}.mc-lyric{font-style:italic}.prose em{font-style:italic}.toc a:before{font-style:italic;content:counter(toc,decimal-leading-zero)}'
  const result = analyze('<span class="timeline-date">A</span><p class="mc-lyric">B<i>C</i></p><div class="prose"><em>D</em></div><nav class="toc"><a>标题</a></nav>', css)
  assert.deepEqual(result.italicCharacters, chars('ABCD0123456789'))
  assert.ok(result.characters.includes('标'))
  assert.deepEqual(analyze('<span>A</span>', '.toc a::before{font-style:italic;content:counter(toc,decimal-leading-zero)}').italicCharacters, [])
}
{
  for (const css of ['.unknown{font-style:italic}', '.post-meta time:hover{font-style:italic}', '.prose em{font-style:var(--style)}', '.prose em{font:italic 16px serif}', '.label:before{content:var(--label)}', '.label:before{content:counter(chapter,upper-roman)}']) {
    assert.equal(analyze('<em>A</em>', css).italicCharacters, null, css)
  }
  assert.deepEqual(analyze('<em>A</em>', 'button{font:inherit}em{font-style:normal}').italicCharacters, ['A'])
  assert.equal(analyze('<em>A</em>', '', '<link rel="stylesheet" href="https://unknown.example/fonts.css">').italicCharacters, null)
  assert.notEqual(analyze('<em>A</em>', '', '<link rel="preload" as="style" href="/unused.css">').italicCharacters, null)
}
{
  const result = analyze('字😀👨‍👩‍👧‍👦⚠️\u200b\u2060\u200e\u2028\u2029<style>.label:before{content:"\\2192 \\1f600 "}</style><script>IGNORE</script><noscript>HIDDEN</noscript><input placeholder="P"><img title="T" alt="A">')
  assert.ok(result.characters.includes('😀') && result.characters.includes('→') && result.characters.includes('👨'))
  for (const c of ['\u200d', '\ufe0f', '\u200b', '\u2060', '\u200e', '\u2028', '\u2029']) assert.ok(!result.characters.includes(c))
  assert.ok(!result.characters.includes('I') && !result.characters.includes('H'))
  assert.ok(['P', 'T', 'A'].every(c => result.characters.includes(c)))
  assert.equal(result.italicCharacters, null, 'unrecognized generated selectors conservatively retain the full italic set')
}
{
  const result = analyze('<div data-label="新字">A</div>', '.label:before{content:attr(data-label)}')
  assert.ok(result.characters.includes('新') && result.characters.includes('字'))
  const imported = analyzeFontText('<link rel="stylesheet" href="/a.css"><body><em>A</em></body>', new Map([['/a.css', '@import "b.css";'], ['/b.css', '.prose hr:before{content:"Z"}']]))
  assert.ok(imported.characters.includes('Z'))
  assert.notEqual(imported.italicCharacters, null)
}
{
  const source = new Map([['/theme.css', '.post-meta time{font-style:italic}'], ['/unused.css', '.unknown{font-style:italic}']])
  assert.notEqual(analyzeFontText('<link rel="stylesheet" href="/theme.css"><body><em>A</em></body>', source).italicCharacters, null)
  assert.equal(analyze('<span style="font-style:var(--x)">A</span>').italicCharacters, null)
  assert.equal(analyze('A', 'invalid {').italicCharacters, null)
}
{
  // Display-face characters: only text inside elements the CSS sets in --font-display.
  const css = '.post-title{font-family:var(--font-display)}.prose h2,.prose blockquote p{font-family:var(--font-display)}.nav a:hover{font-family:var(--font-display)}'
  const html = '<h2 class="post-title"><a>题目</a></h2><p>正文</p><div class="prose"><h2>小节</h2><blockquote><p>引文</p></blockquote><p>其他</p></div><nav class="nav"><a>导航</a></nav><span>侧</span>'
  const result = analyze(html, css)
  assert.deepEqual(result.displayCharacters, chars('题目小节引文导航'))
  assert.ok(result.characters.includes('正') && result.characters.includes('侧'))
  // Inline styles and generated content count as display text.
  assert.ok(analyze('<span style="font-family: var(--font-display)">字</span><b>否</b>').displayCharacters.includes('字'))
  assert.ok(!analyze('<span style="font-family: var(--font-display)">字</span><b>否</b>').displayCharacters.includes('否'))
  assert.ok(analyze('<p class="x">A</p>', '.x:before{content:"、"}.x{font-family:var(--font-display)}').displayCharacters.includes('、'))
  // The display variable definition itself is not a usage; an aliasing custom property is unknown.
  assert.deepEqual(analyze('<p>甲</p>', ':root{--font-display:var(--font-display-web)}').displayCharacters, [])
  assert.equal(analyze('<p>甲</p>', ':root{--heading:var(--font-display)}').displayCharacters, null)
  // Nested rules cannot be matched reliably: fall back to every character.
  assert.equal(analyze('<p>甲</p>', '.a{&.b{font-family:var(--font-display)}}').displayCharacters, null)
}
console.log('PASS font-text: dates, semantic and inline italics, known selectors, conservative fallback, imports, generated content, emoji and display-face text')
