import { parse } from 'parse5'
import postcss from 'postcss'

const invisible = /[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Zl}\p{Zp}]/u
const semanticItalic = new Set(['em', 'i', 'cite', 'dfn', 'var', 'address'])
const knownItalicSelectors = new Set(['.post-meta time', '.timeline-date', '.toc a:before', '.prose em', '.mc-lyric'])
const knownGeneratedSelectors = new Set(['.toc summary:after', '.toc[open] summary:after', '.prose hr:before'])
const globalValues = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer'])
const base = 'https://onpaper.invalid/'
const sorted = characters => [...characters].sort((a, b) => a.codePointAt(0) - b.codePointAt(0))

// Display-face matching deliberately over-collects: unknown parts of a
// selector (attributes, pseudo-classes, sibling context) are dropped, which
// only ever widens the set of elements treated as display text.
function splitSelectorList(selector) {
  const parts = []
  let depth = 0, current = ''
  for (const c of selector) {
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    if (c === ',' && depth === 0) { parts.push(current); current = '' }
    else current += c
  }
  parts.push(current)
  return parts.map(part => part.trim()).filter(Boolean)
}

function parseDisplaySelector(selector) {
  let text = selector
  // Remove functional pseudo-classes with their arguments, then pseudo-elements
  // and simple pseudo-classes, then attribute filters.
  for (let previous; previous !== text;) { previous = text; text = text.replace(/:{1,2}[\w-]+\([^()]*\)/g, '') }
  text = text.replace(/::?[\w-]+/g, '').replace(/\[[^\]]*\]/g, '')
  // Sibling combinators: keep only the subject side.
  const sibling = text.split(/[+~]/)
  text = sibling[sibling.length - 1]
  const compounds = text.replace(/>/g, ' ').trim().split(/\s+/).filter(Boolean).map(compound => {
    const tag = compound.match(/^[a-z][\w-]*/i)?.[0]?.toLowerCase()
    const classes = [...compound.matchAll(/\.([\w-]+)/g)].map(match => match[1])
    const ids = [...compound.matchAll(/#([\w-]+)/g)].map(match => match[1])
    return { tag: tag === undefined || tag === '*' ? undefined : tag, classes, ids }
  })
  return compounds.length ? compounds : [{ classes: [], ids: [] }]
}

function matchesCompound(node, compound) {
  if (compound.tag && node.tagName !== compound.tag) return false
  const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]))
  const classes = new Set((attrs.class ?? '').split(/\s+/))
  return compound.classes.every(name => classes.has(name)) && compound.ids.every(id => attrs.id === id)
}

function matchesSelector(node, ancestors, compounds) {
  if (!matchesCompound(node, compounds[compounds.length - 1])) return false
  let index = compounds.length - 2
  for (let i = ancestors.length - 1; i >= 0 && index >= 0; i--) {
    if (matchesCompound(ancestors[i], compounds[index])) index--
  }
  return index < 0
}

function decodeCSSString(value) {
  return value.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|(\r\n|[\n\r\f])|([\s\S]))/gi, (_, hex, newline, escaped) => {
    if (hex) {
      const code = parseInt(hex, 16)
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd'
    }
    return newline ? '' : escaped
  })
}

// This reads string tokens only; it deliberately does not interpret CSS layout
// or selector specificity. Unknown generated content causes a safe fallback.
function stringTokens(value) {
  const strings = []
  let remainder = ''
  for (let i = 0; i < value.length; i++) {
    const quote = value[i]
    if (quote !== '"' && quote !== "'") { remainder += quote; continue }
    let raw = ''
    for (i++; i < value.length && value[i] !== quote; i++) {
      raw += value[i]
      if (value[i] === '\\' && i + 1 < value.length) raw += value[++i]
    }
    strings.push(decodeCSSString(raw))
    remainder += ' '
  }
  return { strings, remainder: remainder.trim() }
}

/**
 * Collect font text without rendering HTML or implementing the CSS cascade.
 * Known component selectors and semantic italics may over-collect. Any style
 * outside that contract returns null for italics, preserving the full Latin set.
 */
export function analyzeFontText(html, cssSources) {
  const characters = new Set(), italicCharacters = new Set(), displayCharacters = new Set(), nodes = [], sheets = []
  const displaySelectors = []
  let conservative = false, hasTOC = false, hasFreeItalic = false, displayConservative = false
  // Generated content is rare and short; count it as display text as well.
  const add = (text, italic = false, generated = false) => {
    for (const c of text) if (!invisible.test(c)) {
      characters.add(c)
      if (italic) italicCharacters.add(c)
      if (generated) displayCharacters.add(c)
    }
  }
  const displayReference = /var\(\s*--font-display\s*[,)]/
  function inspectDisplay(declaration, inline) {
    const prop = declaration.prop.toLowerCase(), value = declaration.value
    if (prop === '--font-display' || !displayReference.test(value)) return
    if (prop !== 'font-family' || inline) { if (prop !== 'font-family') displayConservative = true; return }
    const rule = declaration.parent
    if (rule?.type !== 'rule' || rule.parent?.type === 'rule') { displayConservative = true; return }
    for (const selector of splitSelectorList(rule.selector ?? '')) displaySelectors.push(parseDisplaySelector(selector))
  }
  function inspectDeclarations(css, inline = false, source = base, inlineItalic = false) {
    let root
    try { root = postcss.parse(inline ? 'onpaper-inline{' + css + '}' : css) }
    catch { conservative = true; return }
    root.walkAtRules('import', rule => {
      const target = rule.params.match(/^\s*(?:url\(\s*(['"]?)([^'"\)\s]+)\1\s*\)|(['"])(.*?)\3)/)
      if (target) inspectSheet(target[2] ?? target[4], source)
      else conservative = true
    })
    root.walkDecls(declaration => {
      if (declaration.parent.type === 'atrule' && declaration.parent.name.toLowerCase() === 'font-face') return
      inspectDisplay(declaration, inline)
      const prop = declaration.prop.toLowerCase(), value = declaration.value.trim()
      if (prop === 'font-style') {
        const normalized = value.toLowerCase()
        if (normalized === 'normal' || globalValues.has(normalized)) return
        const italic = /^(?:italic|oblique(?:\s+[-+\d.]+(?:deg|grad|rad|turn))?)$/.test(normalized)
        if (!italic) { conservative = true; return }
        if (!inline) {
          const selectors = (declaration.parent.selector ?? '').split(',').map(selector => selector.trim().replaceAll('::before', ':before').replace(/\s+/g, ' '))
          if (!selectors.length || selectors.some(selector => !knownItalicSelectors.has(selector))) conservative = true
        }
      }
      if (prop === 'font' && !globalValues.has(value.toLowerCase())) conservative = true
      if (prop !== 'content' && prop !== 'quotes') return
      const { strings, remainder } = stringTokens(value)
      const selectors = (declaration.parent.selector ?? '').split(',').map(selector => selector.trim().replace(/::(before|after)/g, ':$1').replace(/\s+/g, ' '))
      const generatedItalic = inline ? inlineItalic : hasFreeItalic || selectors.some(selector => knownItalicSelectors.has(selector))
      for (const string of strings) add(string, generatedItalic, true)
      if (!inline && strings.some(string => string.length) && selectors.some(selector => !knownGeneratedSelectors.has(selector) && !knownItalicSelectors.has(selector))) conservative = true
      let unknown = remainder.replace(/\b(?:none|normal)\b/gi, '').trim()
      unknown = unknown.replace(/counter\(\s*([\w-]+)\s*(?:,\s*(decimal(?:-leading-zero)?)\s*)?\)/gi, (_, name) => {
        if (name !== 'toc' || hasTOC) add('0123456789', true, true)
        return ''
      })
      unknown = unknown.replace(/attr\(\s*([\w-]+)\s*\)/gi, (_, attribute) => {
        for (const node of nodes) for (const attr of node.attrs ?? []) if (attr.name === attribute.toLowerCase()) add(attr.value, true, true)
        return ''
      })
      if (unknown.trim()) conservative = true
    })
  }
  const visited = new Set()
  function inspectSheet(href, relativeTo = base) {
    let url
    try { url = new URL(href, relativeTo) }
    catch { conservative = true; return }
    const candidates = [href, url.href]
    if (url.origin === new URL(base).origin) candidates.push(url.pathname + url.search, url.pathname)
    const key = candidates.find(candidate => cssSources.has(candidate))
    if (key === undefined) { conservative = true; return }
    if (visited.has(key)) return
    visited.add(key)
    inspectDeclarations(cssSources.get(key), false, url.href)
  }
  function walk(node, inBody = false, italic = false, inPostMeta = false) {
    if (['script', 'noscript'].includes(node.tagName)) return
    if (node.tagName === 'style') {
      sheets.push({ css: (node.childNodes ?? []).map(child => child.value ?? '').join('') })
      return
    }
    nodes.push(node)
    const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]))
    const classes = new Set((attrs.class ?? '').split(/\s+/))
    hasTOC ||= classes.has('toc')
    inBody ||= node.tagName === 'body'
    if (node.tagName === 'link' && (attrs.rel ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) {
      if (attrs.href) sheets.push({ href: attrs.href })
      else conservative = true
    }
    const inlineItalic = /(?:^|;)\s*font(?:-style)?\s*:[^;]*(?:italic|oblique)/i.test(attrs.style ?? '')
    hasFreeItalic ||= semanticItalic.has(node.tagName) || classes.has('timeline-date') || classes.has('mc-lyric') || inlineItalic
    italic ||= semanticItalic.has(node.tagName) || classes.has('timeline-date') || classes.has('mc-lyric') || (node.tagName === 'time' && inPostMeta) || inlineItalic
    if (inBody) {
      if (node.nodeName === '#text') add(node.value, italic)
      for (const name of ['placeholder', 'title', 'alt']) if (attrs[name]) add(attrs[name], italic)
      if (attrs.style) sheets.push({ css: attrs.style, inline: true, italic })
    }
    for (const child of node.childNodes ?? []) walk(child, inBody, italic, inPostMeta || classes.has('post-meta'))
  }
  const document = parse(html)
  walk(document)
  for (const sheet of sheets) {
    if (sheet.href) inspectSheet(sheet.href)
    else inspectDeclarations(sheet.css, sheet.inline, base, sheet.italic)
  }
  // Second pass: text inside elements that the CSS sets in the display face.
  function walkDisplay(node, ancestors = [], inBody = false, display = false) {
    if (['script', 'noscript', 'style'].includes(node.tagName)) return
    const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]))
    inBody ||= node.tagName === 'body'
    if (node.tagName) {
      display ||= displayReference.test(attrs.style ?? '')
        || displaySelectors.some(compounds => matchesSelector(node, ancestors, compounds))
    }
    if (inBody && display) {
      if (node.nodeName === '#text') add(node.value, false, true)
      for (const name of ['placeholder', 'title', 'alt']) if (attrs[name]) add(attrs[name], false, true)
    }
    const next = node.tagName ? [...ancestors, node] : ancestors
    for (const child of node.childNodes ?? []) walkDisplay(child, next, inBody, display)
  }
  if (!displayConservative) walkDisplay(document)
  return {
    characters: sorted(characters),
    italicCharacters: conservative ? null : sorted(italicCharacters),
    displayCharacters: displayConservative ? null : sorted(displayCharacters),
  }
}
