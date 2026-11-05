/** Add safe rel/target attributes to external links in article content. */
export function rehypeExternalLinks() {
  return (tree) => {
    function walk(node) {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href
        if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
          node.properties.target = '_blank'
          node.properties.rel = ['noopener', 'noreferrer']
        }
      }
      if (node.children) node.children.forEach(walk)
    }
    walk(tree)
  }
}