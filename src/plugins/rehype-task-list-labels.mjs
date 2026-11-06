/**
 * GFM task lists emit disabled checkboxes without labels. Give each one an
 * accessible name derived from its list item so axe/Lighthouse and screen
 * readers do not see an unlabeled form control.
 */

function textContent(node) {
  if (node.type === 'text') return node.value
  if (!node.children) return ''
  return node.children.map(textContent).join('')
}

function walk(node) {
  if (node.type === 'element' && node.tagName === 'li') {
    const classes = node.properties?.className
    const isTask = Array.isArray(classes)
      ? classes.includes('task-list-item')
      : typeof classes === 'string' && classes.split(/\s+/).includes('task-list-item')

    if (isTask) {
      const input = node.children?.find(
        child => child.type === 'element'
          && child.tagName === 'input'
          && child.properties?.type === 'checkbox',
      )
      if (input) {
        const label = textContent(node).replace(/\s+/g, ' ').trim() || '任务'
        input.properties = input.properties ?? {}
        input.properties.ariaLabel = `${input.properties.checked ? '已完成' : '未完成'}：${label}`
      }
    }
  }

  node.children?.forEach(walk)
}

export function rehypeTaskListLabels() {
  return (tree) => {
    walk(tree)
  }
}