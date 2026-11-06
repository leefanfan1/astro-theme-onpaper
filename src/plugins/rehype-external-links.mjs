/**
 * Harden links/media in article content:
 * - drop javascript:/vbscript:/data: URLs
 * - add safe rel/target attributes to external links
 *
 * Markdown is treated as trusted author content, but this still blocks the
 * most common HTML-injection payloads if a post or guest submission slips in.
 */

const DANGEROUS_URL = /^\s*(?:javascript|vbscript|data):/i

function isDangerous(value) {
  return typeof value === 'string' && DANGEROUS_URL.test(value)
}

export function rehypeExternalLinks() {
  return (tree) => {
    function walk(node) {
      if (node.type === 'element') {
        const properties = node.properties ?? {}

        if (node.tagName === 'a') {
          if (isDangerous(properties.href)) {
            properties.href = '#'
          }
          else if (typeof properties.href === 'string' && /^https?:\/\//i.test(properties.href)) {
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

    walk(tree)
  }
}