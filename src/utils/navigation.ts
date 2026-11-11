import type { TransitionBeforePreparationEvent } from 'astro:transitions/client'
import { prepareNavigationFonts, warmPageFonts } from '@/utils/fonts'

interface Page {
  document: Document
  url: string
}

const pages = new Map<string, { expires: number, page: Promise<Page | null> }>()
const MAX_PAGES = 16
const CACHE_MS = 5 * 60 * 1000
let installed = false
const speculations = new Map<string, AbortController>()
const packets: Record<string, string> = {}
let prefetchVersion = 0
let navigating = false

function pageUrl(href: string) {
  const url = new URL(href, location.href)
  if (url.origin !== location.origin || !/^\/(?:$|(?:posts|page|tags|about|friends)(?:\/|$))/.test(url.pathname)) return null
  url.hash = ''
  return url
}

function readRoutes(next: Document) {
  try {
    const routes = JSON.parse(next.querySelector('[data-onpaper-navigation]')?.textContent ?? '{}')
    for (const [path, href] of Object.entries(routes)) {
      if (typeof href === 'string' && /^\/_navigation\/[a-f0-9]+\//.test(href)) packets[path] = href
    }
  } catch { /* An older deployment can still use ordinary HTML navigation. */ }
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
  pages.delete(url)
  pages.set(url, entry)
  return entry.page
}

function parsePage(html: string, url: string) {
  const next = new DOMParser().parseFromString(html, 'text/html')
  if (!next.querySelector('[name="astro-view-transitions-enabled"]')) return null
  next.querySelectorAll('noscript').forEach(node => node.remove())
  return { document: next, url } as Page
}

async function requestPage(url: URL, signal: AbortSignal, priority: 'high' | 'low') {
  const packet = packets[url.pathname]
  if (packet) {
    try {
      const response = await fetch(packet, { signal, priority })
      if (!response.ok || new URL(response.url).origin !== location.origin) throw new Error('Navigation packet unavailable')
      const data = await response.json()
      if (data.url !== url.pathname || typeof data.html !== 'string') throw new Error('Navigation packet mismatch')
      const page = parsePage(data.html, url.href)
      if (page) return page
    } catch { if (signal.aborted) return null }
  }
  try {
    const response = await fetch(url.href, { signal, priority })
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')
      || new URL(response.url).origin !== location.origin) return null
    return parsePage(await response.text(), response.url)
  } catch { return null }
}

function cancelSpeculation(href: string, controller: AbortController) {
  controller.abort()
  speculations.delete(href)
  // A completed packet remains useful even if its background decoding stopped.
  // An interrupted fetch removes itself from the cache when it resolves null.
}

function cancelSpeculations(destination?: string) {
  ++prefetchVersion
  for (const [href, controller] of speculations) {
    if (href !== destination) cancelSpeculation(href, controller)
  }
}

function prefetch(href: string) {
  const url = pageUrl(href)
  if (navigating || !url || url.href === location.href.split('#')[0]) return Promise.resolve(null)
  const existing = cached(url.href)
  if (existing) return existing
  if (speculations.size >= 2) {
    const [href, controller] = speculations.entries().next().value!
    cancelSpeculation(href, controller)
  }
  const controller = new AbortController()
  speculations.set(url.href, controller)
  // Fetch the document first, then warm its independently cached hosted fonts.
  const pending = requestPage(url, controller.signal, 'low')
  store(url.href, pending)
  void pending.then(async page => {
    if (!page) {
      if (pages.get(url.href)?.page === pending) pages.delete(url.href)
      return
    }
    if (controller.signal.aborted) return
    await warmPageFonts(page.document.body, { signal: controller.signal, priority: 'low' })
  }).catch(() => {}).finally(() => {
    if (speculations.get(url.href) === controller) speculations.delete(url.href)
  })
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
  readRoutes(document)
  store(location.href.split('#')[0], Promise.resolve({ document: document.cloneNode(true) as Document, url: location.href.split('#')[0] }))

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
    cancelSpeculations(event.to.href.split('#')[0])
    window.clearTimeout(hoverTimer)
    window.clearTimeout(idle)
    navigating = true
    const current = prefetchVersion
    event.signal.addEventListener('abort', () => { if (prefetchVersion === current) navigating = false }, { once: true })
    const load = event.loader
    event.loader = async () => {
      const destination = event.to.href.split('#')[0]
      const hit = cached(destination)
      let page = hit ? await hit : await requestPage(new URL(destination), event.signal, 'high')
      if (event.signal.aborted) return
      if (page) {
        event.newDocument = page.document.cloneNode(true) as Document
        const hash = event.to.hash
        event.to = new URL(page.url)
        event.to.hash = hash
        store(destination, Promise.resolve(page))
      } else {
        await load()
        if (event.signal.aborted || event.defaultPrevented
          || !event.newDocument.querySelector('[name="astro-view-transitions-enabled"]')) return
        page = { document: event.newDocument.cloneNode(true) as Document, url: event.to.href }
        store(destination, Promise.resolve(page))
      }
      // The destination HTML is now complete. Cancel only its speculative
      // preparation so the foreground can request missing fonts at high priority.
      const speculative = speculations.get(destination)
      if (speculative) cancelSpeculation(destination, speculative)
      const styles = stylesFor(event.newDocument, event.to.href)
      // Keep the current page visible while the incoming page's glyphs load.
      // Cancellation must release the router even if a font request stalls.
      if (event.signal.aborted) return
      let onAbort: () => void = () => {}
      const aborted = new Promise<void>(resolve => { onAbort = resolve })
      event.signal.addEventListener('abort', onAbort, { once: true })
      try {
        let delay = 500
        while (!event.signal.aborted) {
          try {
            await Promise.race([Promise.all([styles, prepareNavigationFonts(event.newDocument.body, { signal: event.signal, priority: 'high' })]), aborted])
            break
          } catch {
            // Retry without swapping to an unreadable page. Another click aborts
            // this wait and starts its own navigation immediately.
            await new Promise<void>(resolve => {
              const finish = () => { window.clearTimeout(timer); event.signal.removeEventListener('abort', finish); resolve() }
              const timer = window.setTimeout(finish, delay)
              event.signal.addEventListener('abort', finish, { once: true })
            })
            delay = Math.min(delay * 2, 10000)
          }
        }
      }
      finally { event.signal.removeEventListener('abort', onAbort) }
    }
  })

  function canPrefetch() {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean, effectiveType?: string } }).connection
    return !navigating && navigator.onLine && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
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

  const autoWarmed = new Set<string>()
  let idle: number | undefined
  let observing: IntersectionObserver | undefined
  function scheduleWarm() {
    window.clearTimeout(idle)
    if (canPrefetch()) idle = window.setTimeout(warmVisibleLinks, 120)
  }
  function warmVisibleLinks() {
    if (!canPrefetch()) return
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
    if (connection?.effectiveType === '3g') return
    const urls = new Set<string>()
    // Prepare reading destinations before side navigation. Bound idle traffic
    // to four routes per page; scrolling can reveal the next-page link later.
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>('.post-title a, .pagination a, .post-nav a'),
      ...document.querySelectorAll<HTMLAnchorElement>('.rail-nav a, .mobile-nav a'),
    ]
    for (const link of links) {
      const href = link.href.split('#')[0]
      if (urls.size >= 2 || autoWarmed.size + urls.size >= 4) break
      if (href === location.href.split('#')[0] || autoWarmed.has(href) || cached(href)
        || !link.getClientRects().length || !linkFrom(link)) continue
      const rect = link.getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < innerHeight) urls.add(href)
    }
    const current = prefetchVersion
    const worker = async () => {
      for (const href of urls) {
        if (current !== prefetchVersion || !canPrefetch()) break
        autoWarmed.add(href)
        await prefetch(href)
      }
    }
    void worker()
  }
  function observeLinks() {
    observing?.disconnect()
    autoWarmed.clear()
    observing = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) scheduleWarm()
    })
    document.querySelectorAll('.post-title a, .pagination a, .post-nav a').forEach(link => observing!.observe(link))
    scheduleWarm()
  }
  document.addEventListener('astro:page-load', () => {
    navigating = false
    readRoutes(document)
    observeLinks()
  })
  document.addEventListener('onpaper:content-ready', scheduleWarm)
  observeLinks()
}
