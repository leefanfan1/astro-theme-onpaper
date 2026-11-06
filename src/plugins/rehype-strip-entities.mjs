/**
 * Clean HTML entities in rendered article text.
 *
 * Valid entities are normally decoded by the HTML parser, but unknown named
 * entities such as `&unknown;` stay as literal text and hurt reading. Decode
 * the common ones and drop the rest. Code, math and diagram blocks are left
 * untouched so their source stays exact.
 */
import { decodeHtmlEntities } from '../utils/html-entities.ts'

const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'textarea'])
const SKIP_CLASSES = new Set(['katex', 'katex-display', 'mermaid', 'shiki', 'astro-code'])

function shouldSkip(node) {
  if (node.type !== 'element') return false
  if (SKIP_TAGS.has(node.tagName)) return true
  const className = node.properties?.className
  const classes = Array.isArray(className)
    ? className
    : typeof className === 'string'
      ? className.split(/\s+/)
      : []
  return classes.some(name => SKIP_CLASSES.has(name))
}

export function rehypeStripEntities() {
  return (tree) => {
    function walk(node) {
      if (shouldSkip(node)) return
      if (node.type === 'text' && typeof node.value === 'string') {
        node.value = decodeHtmlEntities(node.value)
        return
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) walk(child)
      }
    }

    walk(tree)
  }
}