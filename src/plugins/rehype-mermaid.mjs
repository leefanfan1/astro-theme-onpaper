/**
 * Turn ```mermaid fenced blocks into <pre class="mermaid">source</pre>.
 * The browser loads Mermaid only when such a block exists.
 */
function textOf(node) {
  if (node.type === 'text') return node.value
  if (!node.children) return ''
  return node.children.map(textOf).join('')
}

export function rehypeMermaid() {
  return (tree) => {
    function walk(node) {
      if (!node.children) return
      for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i]
        if (child.type === 'element' && child.tagName === 'pre') {
          const code = child.children?.find(c => c.type === 'element' && c.tagName === 'code')
          const classes = code?.properties?.className ?? []
          const isMermaid = classes.some(c => String(c).includes('mermaid'))
            // hast spells a data attribute in camelCase; `data-language` on
            // the element is `dataLanguage` here. Asking for the hyphenated
            // name never matched, so every ```mermaid fence stayed a code
            // block and the diagram never rendered.
            || child.properties?.dataLanguage === 'mermaid'
            || code?.properties?.dataLanguage === 'mermaid'
            || child.properties?.className?.some?.(name => String(name).includes('language-mermaid'))
            || code?.properties?.className?.some?.(name => String(name).includes('language-mermaid'))
          if (code && isMermaid) {
            const source = textOf(code).trim()
            node.children[i] = {
              type: 'element',
              tagName: 'pre',
              properties: { className: ['mermaid'] },
              children: [{ type: 'text', value: source }],
            }
            continue
          }
        }
        walk(child)
      }
    }
    walk(tree)
  }
}