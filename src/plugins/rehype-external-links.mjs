/**
 * Harden links/media in article content:
 * - drop javascript:/vbscript:/data: URLs
 * - add safe rel/target attributes to external links
 *
 * Markdown is treated as trusted author content; this blocks dangerous URL
 * schemes. This is URL hardening, not an HTML sanitizer.
 */

import rehypeRaw from 'rehype-raw'

// Parse raw HTML before applying the same URL policy to all links and media.
const DANGEROUS_URL = /^(?:javascript|vbscript|data):/i

function isDangerous(value) {
  if (typeof value !== 'string') return false
  // Match browser URL parsing: strip TAB/LF/CR anywhere and leading C0/space.
  const normalized = value.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '')
  return DANGEROUS_URL.test(normalized)
}

export function rehypeExternalLinks() {
  return (tree) => {
    const parsed = rehypeRaw()(tree)
    function walk(node) {
      if (node.type === 'element') {
        const properties = node.properties ?? {}

        if (node.tagName === 'a') {
          for (const property of ['href', 'xLinkHref']) {
            if (isDangerous(properties[property])) properties[property] = '#'
          }
          if (typeof properties.href === 'string' && /^https?:\/\//i.test(properties.href)) {
            properties.target = '_blank'
            properties.rel = ['noopener', 'noreferrer']
          }
        }

        if (['img', 'iframe', 'video', 'audio', 'source', 'embed'].includes(node.tagName)) {
          if (isDangerous(properties.src)) delete properties.src
        }

        if (node.tagName === 'img') {
          properties.loading = 'lazy'
          properties.decoding = 'async'
        }

        if (node.tagName === 'object' && isDangerous(properties.data)) {
          delete properties.data
        }

        if (node.tagName === 'form' && isDangerous(properties.action)) {
          delete properties.action
        }
      }

      if (node.children) node.children.forEach(walk)
    }

    walk(parsed)
    return parsed
  }
}
