import type {} from '../fonts'

function prepareTextFonts(content: ParentNode) {
  return window.__onpaperFonts?.prepareTextFonts(content) ?? Promise.resolve()
}

interface SearchItem {
  title: string
  description: string
  tags: string[]
  date: string
  url: string
  content: string
}

let dialog: HTMLDialogElement | null = null
let input: HTMLInputElement | null = null
let resultsEl: HTMLElement | null = null
let statusEl: HTMLElement | null = null

function refreshElements() {
  dialog = document.querySelector<HTMLDialogElement>('[data-search-dialog]')
  input = document.querySelector<HTMLInputElement>('#search-input')
  resultsEl = document.querySelector<HTMLElement>('[data-search-results]')
  statusEl = document.querySelector<HTMLElement>('[data-search-status]')
}

refreshElements()

let index: SearchItem[] | null = null
let loading: Promise<SearchItem[]> | null = null
let renderVersion = 0
const normalized = new WeakMap<SearchItem, { title: string, description: string, tags: string, content: string, haystack: string }>()

function prepareItem(item: SearchItem) {
  const title = item.title.toLowerCase()
  const description = item.description.toLowerCase()
  const tags = item.tags.join(' ').toLowerCase()
  const content = item.content.toLowerCase()
  const fields = { title, description, tags, content, haystack: `${title} ${description} ${tags} ${content}` }
  normalized.set(item, fields)
  return fields
}
let lastTrigger: HTMLElement | null = null
let renderTimer: number | undefined
let closeTimer: number | undefined

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function appendHighlighted(el: HTMLElement, text: string, tokens: string[]) {
  if (!tokens.length) {
    el.textContent = text
    return
  }
  const regex = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(regex)
  for (const part of parts) {
    if (!part) continue
    if (tokens.some(token => part.toLowerCase() === token.toLowerCase())) {
      const mark = document.createElement('mark')
      mark.textContent = part
      el.append(mark)
    }
    else {
      el.append(document.createTextNode(part))
    }
  }
}

function excerpt(item: SearchItem, tokens: string[]) {
  const content = item.content || item.description
  if (!content) return ''
  const lower = content.toLowerCase()
  const at = tokens
    .map(token => lower.indexOf(token.toLowerCase()))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]
  if (at === undefined) return content.slice(0, 140)
  const start = Math.max(0, at - 46)
  const end = Math.min(content.length, at + 110)
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`
}

function search(items: SearchItem[], rawQuery: string) {
  const query = rawQuery.trim().toLowerCase()
  const tokens = query.split(/\s+/).filter(Boolean)
  if (!tokens.length) return []

  return items
    .map((item) => {
      const { title, description, tags, content, haystack } = normalized.get(item) ?? prepareItem(item)
      if (!tokens.every(token => haystack.includes(token))) return null

      let score = 0
      if (title.includes(query)) score += 24
      if (title.startsWith(query)) score += 12
      for (const token of tokens) {
        if (title.includes(token)) score += 8
        if (tags.includes(token)) score += 5
        if (description.includes(token)) score += 3
        if (content.includes(token)) score += 1
      }
      return { item, score }
    })
    .filter((entry): entry is { item: SearchItem, score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
    .slice(0, 8)
}

async function loadIndex() {
  if (index) return index
  if (loading) return loading
  refreshElements()
  const url = dialog?.dataset.indexUrl
  if (!url) throw new Error('Missing search index URL')
  loading = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json() as Promise<SearchItem[]>
    })
    .then((data) => {
      data.forEach(prepareItem)
      index = data
      return data
    })
  loading = loading.catch(error => { loading = null; throw error })
  return loading
}

function renderMessage(message: string) {
  resultsEl!.replaceChildren()
  const p = document.createElement('p')
  p.className = 'search-hint'
  p.textContent = message
  resultsEl!.append(p)
}

async function render(rawQuery: string) {
  const current = ++renderVersion
  refreshElements()
  if (!resultsEl || !statusEl) return
  const query = rawQuery.trim()
  if (!query) {
    renderMessage('输入关键词，搜索标题、摘要、标签和正文。')
    statusEl.textContent = ''
    return
  }

  renderMessage('正在建立索引…')
  let items: SearchItem[]
  try {
    items = await loadIndex()
  }
  catch {
    if (current !== renderVersion) return
    renderMessage('搜索索引加载失败，请刷新页面重试。')
    statusEl.textContent = '搜索索引加载失败'
    return
  }

  if (current !== renderVersion) return
  const tokens = query.split(/\s+/).filter(Boolean)
  const matches = search(items, query)
  statusEl.textContent = `${matches.length} 条搜索结果`
  const results = document.createDocumentFragment()
  if (!matches.length) {
    const message = document.createElement('p')
    message.className = 'search-hint'
    message.textContent = `没有找到与“${query}”相关的文章。`
    results.append(message)
  }
  for (const { item } of matches) {
    const a = document.createElement('a')
    a.className = 'search-result'
    a.href = item.url

    const title = document.createElement('span')
    title.className = 'search-result__title'
    appendHighlighted(title, item.title, tokens)

    const meta = document.createElement('span')
    meta.className = 'search-result__meta'
    meta.textContent = [item.date, ...item.tags].filter(Boolean).join(' · ')

    const text = document.createElement('span')
    text.className = 'search-result__excerpt'
    appendHighlighted(text, excerpt(item, tokens), tokens)

    a.append(title, meta, text)
    results.append(a)
  }
  try {
    // Results can contain letters outside the current page's small font set.
    // Prepare the original fallback faces before exposing the new text.
    await prepareTextFonts(results)
  }
  catch {
    if (current === renderVersion && dialog?.open) {
      renderTimer = window.setTimeout(() => { void render(rawQuery) }, 1000)
    }
    return
  }
  if (current !== renderVersion) return
  resultsEl.replaceChildren(results)
}

function setTriggerState(open: boolean) {
  document.querySelectorAll<HTMLElement>('[data-search-trigger]').forEach((trigger) => {
    trigger.setAttribute('aria-haspopup', 'dialog')
    trigger.setAttribute('aria-controls', 'search-dialog')
    trigger.setAttribute('aria-expanded', String(open))
  })
}

function finishClose() {
  if (closeTimer) {
    window.clearTimeout(closeTimer)
    closeTimer = undefined
  }
  dialog?.classList.remove('is-closing')
  document.body.classList.remove('search-open')
  setTriggerState(false)
  if (lastTrigger?.isConnected) lastTrigger.focus()
}

function openSearch() {
  refreshElements()
  bindSearchDialog()
  if (!dialog || !input) return
  lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null

  if (closeTimer) {
    window.clearTimeout(closeTimer)
    closeTimer = undefined
  }
  dialog.classList.remove('is-closing')

  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }

  document.body.classList.add('search-open')
  setTriggerState(true)
  input.value = ''
  void loadIndex().catch(() => {})
  render('')
  requestAnimationFrame(() => input.focus())
}

function closeSearch() {
  refreshElements()
  if (!dialog?.open || dialog.classList.contains('is-closing')) return

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || typeof dialog.close !== 'function') {
    if (typeof dialog.close === 'function') dialog.close()
    else {
      dialog.removeAttribute('open')
      finishClose()
    }
    return
  }

  const closingDialog = dialog
  closingDialog.classList.add('is-closing')
  closeTimer = window.setTimeout(() => {
    closeTimer = undefined
    closingDialog.classList.remove('is-closing')
    if (closingDialog.open) closingDialog.close()
  }, 240)
}

function bindSearchDialog() {
  refreshElements()
  const currentDialog = dialog
  const currentInput = input
  if (!currentDialog || currentDialog.dataset.searchDialogBound === 'true') return
  currentDialog.dataset.searchDialogBound = 'true'

  currentDialog.addEventListener('click', (event) => {
    if (event.target === currentDialog) closeSearch()
  })

  currentDialog.addEventListener('close', finishClose)
  currentDialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    closeSearch()
  })

  currentDialog.querySelector('[data-search-close]')?.addEventListener('click', closeSearch)

  currentInput?.addEventListener('input', () => {
    window.clearTimeout(renderTimer)
    renderTimer = window.setTimeout(() => render(currentInput.value), 90)
  })

  currentInput?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      const first = resultsEl?.querySelector<HTMLElement>('.search-result')
      if (first) {
        event.preventDefault()
        first.focus()
      }
    }
    if (event.key === 'Enter') {
      const first = resultsEl?.querySelector<HTMLAnchorElement>('.search-result')
      if (first) {
        event.preventDefault()
        first.click()
      }
    }
  })

  currentDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSearch()
      return
    }
    if (event.defaultPrevented) return
    const results = [...(resultsEl?.querySelectorAll<HTMLElement>('.search-result') ?? [])]
    if (!results.length) return
    const active = document.activeElement
    const current = active instanceof HTMLElement ? results.indexOf(active) : -1
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      results[Math.min(current + 1, results.length - 1)]?.focus()
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (current <= 0) currentInput?.focus()
      else results[current - 1]?.focus()
    }
  })
}

function bindSearchTriggers() {
  refreshElements()
  bindSearchDialog()
  document.querySelectorAll<HTMLElement>('[data-search-trigger]').forEach((trigger) => {
    if (trigger.dataset.searchBound === 'true') return
    trigger.dataset.searchBound = 'true'
    trigger.addEventListener('click', (event) => {
      event.preventDefault()
      openSearch()
    })
  })
  setTriggerState(dialog?.open === true)
}

bindSearchTriggers()
document.addEventListener('astro:after-swap', bindSearchTriggers)
document.addEventListener('astro:page-load', bindSearchTriggers)

document.addEventListener('keydown', (event) => {
  const isInput = event.target instanceof HTMLElement
    && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }
  else if (event.key === '/' && !isInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    openSearch()
  }
})

export {}
