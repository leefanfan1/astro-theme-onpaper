import type { TransitionBeforePreparationEvent } from 'astro:transitions/client'
import { preloadPageFonts } from '@/utils/fonts'

interface Page {
  document: Document
  url: string
  fonts?: Promise<void>
}

const pages = new Map<string, { expires: number, page: Promise<Page | null> }>()
const MAX_PAGES = 16
const CACHE_MS = 5 * 60 * 1000
let installed = false

function pageUrl(href: string) {
  const url = new URL(href, location.href)
  if (url.origin !== location.origin || !/^\/(?:$|(?:posts|page|tags|about|friends)(?:\/|$))/.test(url.pathname)) return null
  url.hash = ''
  return url
}

function store(url: string, page: Promise<Page | null>) {
  pages.delete(url)
  pages.set(url, { expires: Date.now() + CACHE_MS, page })
  while (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value!)
  return page
}

function cached(url: string) {
  const entry = pages.get(url)
  if (!entry) return
  if (entry.expires < Date.now()) { pages.delete(url); return }
  // Frequently used routes should survive the bounded cache's eviction.
  pages.delete(url)
  pages.set(url, entry)
  return entry.page
}

async function fontsFor(page: Page) {
  if (!page.fonts) {
    page.fonts = preloadPageFonts(page.document.body)
    page.fonts.catch(() => { page.fonts = undefined })
  }
  await page.fonts
}

function prefetch(href: string) {
  const url = pageUrl(href)
  if (!url) return Promise.resolve(null)
  const existing = cached(url.href)
  if (existing) return existing
  const pending = fetch(url.href, { priority: 'low' }).then(async response => {
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null
    const finalUrl = new URL(response.url)
    if (finalUrl.origin !== location.origin) return null
    const next = new DOMParser().parseFromString(await response.text(), 'text/html')
    if (!next.querySelector('[name="astro-view-transitions-enabled"]')) return null
    next.querySelectorAll('noscript').forEach(node => node.remove())
    const page: Page = { document: next, url: finalUrl.href }
    // Keep fetched HTML usable while speculative font requests are pending.
    void fontsFor(page).catch(() => {})
    return page
  }).catch(() => null)
  store(url.href, pending)
  pending.then(page => { if (!page && pages.get(url.href)?.page === pending) pages.delete(url.href) })
  return pending
}

async function stylesFor(next: Document, base: string) {
  const current = new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link => link.href))
  await Promise.all([...next.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link => {
    const href = new URL(link.getAttribute('href')!, base).href
    if (current.has(href)) return
    return new Promise<void>(resolve => {
      const hint = document.createElement('link')
      hint.rel = 'preload'
      hint.as = 'style'
      hint.href = href
      hint.onload = hint.onerror = () => { hint.remove(); resolve() }
      document.head.append(hint)
    })
  }))
}

export function installNavigation() {
  if (installed) return
  installed = true

  // Navigation animates the live DOM. Only theme changes need native snapshots;
  // even an immediately skipped native capture can retain WebKit font renderers.
  if (document.startViewTransition) {
    const start = document.startViewTransition.bind(document)
    document.startViewTransition = (update) => {
      if (document.documentElement.classList.contains('theme-changing')) return start(update)
      const callback = typeof update === 'function' ? update : update?.update
      const done = Promise.resolve().then(() => callback?.()).then(() => {})
      const ready = done.then(() => { throw new DOMException('Navigation uses live content', 'AbortError') })
      void ready.catch(() => {})
      return {
        ready,
        updateCallbackDone: done,
        finished: done,
        skipTransition() {},
        types: new Set(typeof update === 'object' ? update.types : []),
      } as ViewTransition
    }
  }

  document.addEventListener('astro:before-preparation', (event: TransitionBeforePreparationEvent) => {
    if (event.formData || !pageUrl(event.to.href)) return
    const load = event.loader
    event.loader = async () => {
      const hit = cached(event.to.href.split('#')[0])
      let page = hit ? await hit : null
      if (event.signal.aborted) return
      if (page) {
        event.newDocument = page.document.cloneNode(true) as Document
        const hash = event.to.hash
        event.to = new URL(page.url)
        event.to.hash = hash
        await stylesFor(event.newDocument, event.to.href)
      } else {
        await load()
        if (event.signal.aborted || event.defaultPrevented
          || !event.newDocument.querySelector('[name="astro-view-transitions-enabled"]')) return
        page = { document: event.newDocument.cloneNode(true) as Document, url: event.to.href }
        store(event.to.href.split('#')[0], Promise.resolve(page))
      }
      // Keep the current page visible while the incoming page's glyphs load.
      // Cancellation must release the router even if a font request stalls.
      if (event.signal.aborted) return
      let onAbort: () => void = () => {}
      const aborted = new Promise<void>(resolve => { onAbort = resolve })
      event.signal.addEventListener('abort', onAbort, { once: true })
      try { await Promise.race([fontsFor(page), aborted]) }
      catch { /* The inline loader retries failed requests after the swap. */ }
      finally { event.signal.removeEventListener('abort', onAbort) }
    }
  })

  function canPrefetch() {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean, effectiveType?: string } }).connection
    return navigator.onLine && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
  }
  function linkFrom(target: EventTarget | null) {
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null
    if (!link || link.hasAttribute('download') || link.hasAttribute('data-astro-reload')
      || (link.target && link.target !== '_self') || !pageUrl(link.href)) return null
    return link
  }
  let hoverTimer: number | undefined
  document.addEventListener('pointerover', event => {
    const link = linkFrom(event.target)
    if (!link || (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) || !canPrefetch()) return
    window.clearTimeout(hoverTimer)
    hoverTimer = window.setTimeout(() => { void prefetch(link.href) }, 40)
  }, { passive: true })
  document.addEventListener('pointerout', event => {
    const link = linkFrom(event.target)
    if (link && !(event.relatedTarget instanceof Node && link.contains(event.relatedTarget))) window.clearTimeout(hoverTimer)
  }, { passive: true })
  document.addEventListener('focusin', event => {
    const link = linkFrom(event.target)
    if (link && canPrefetch()) void prefetch(link.href)
  })
  document.addEventListener('pointerdown', event => {
    const link = linkFrom(event.target)
    if (link && canPrefetch()) void prefetch(link.href)
  }, { passive: true })

  // Prepare a small working set while idle, rather than waiting for a click.
  // Two workers and a bounded cache avoid fetching an entire blog at once.
  function warmVisibleLinks() {
    if (!canPrefetch()) return
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
    if (connection?.effectiveType === '3g') return
    const urls = new Set([location.href.split('#')[0]])
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>('.rail-nav a, .mobile-nav a'),
      ...document.querySelectorAll<HTMLAnchorElement>('.post-title a, .pagination a'),
    ]
    links.forEach(link => {
      if (urls.size >= 7 || !link.getClientRects().length || !linkFrom(link)) return
      const rect = link.getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < innerHeight) urls.add(link.href.split('#')[0])
    })
    const queue = [...urls].filter(url => url !== location.href.split('#')[0])
    const worker = async () => { for (let href; (href = queue.shift());) await prefetch(href) }
    void worker()
    void worker()
  }
  let idle: number | undefined
  document.addEventListener('onpaper:content-ready', () => {
    window.clearTimeout(idle)
    idle = window.setTimeout(warmVisibleLinks, 250)
  })
}
