// Runs inline before first paint, independently of page modules.
;(() => {
  if (window.__onpaperFonts || !document.fonts) return
  document.documentElement.dataset.fontState = 'loading'

  const ranges = new WeakMap()
  const replacements = new WeakMap()
  const retries = new WeakMap()
  const attempts = new WeakMap()
  const sources = new Map()
  const scannedSheets = new WeakSet()

  function familyName(family) {
    return family.trim().replace(/^['"]|['"]$/g, '')
  }

  function currentFace(face) {
    while (replacements.has(face)) face = replacements.get(face)
    return face
  }

  function covers(face, characters) {
    let intervals = ranges.get(face)
    if (!intervals) {
      intervals = face.unicodeRange.split(',').map(range => {
        const value = range.trim().replace(/^U\+/i, '')
        const [start, end = start] = value.split('-')
        return [parseInt(start.replace(/\?/g, '0'), 16), parseInt(end.replace(/\?/g, 'F'), 16)]
      })
      ranges.set(face, intervals)
    }
    return intervals.some(([start, end]) => characters.some(code => code >= start && code <= end))
  }

  function requiredFaces(content) {
    const style = getComputedStyle(document.documentElement)
    const families = new Set(['--font-body-web', '--font-display-web'].flatMap(property =>
      style.getPropertyValue(property).split(',').map(familyName)))
    const faces = [...new Set([...document.fonts].map(currentFace))].filter(face => families.has(familyName(face.family)))
    if (!faces.length) throw new Error('Theme font definitions are unavailable')

    const text = new Set()
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (walker.currentNode.parentElement?.closest('script, style, noscript')) continue
      for (const character of walker.currentNode.textContent ?? '') text.add(character)
    }
    content.querySelectorAll('input, textarea, [title]').forEach(element => {
      for (const character of (element.getAttribute('placeholder') ?? '') + (element.getAttribute('title') ?? '')) text.add(character)
    })
    const characters = [...text].map(character => character.codePointAt(0))
    return faces.filter(face => covers(face, characters))
  }

  function faceKey(face) {
    return [familyName(face.family), face.style, face.weight, face.stretch, face.unicodeRange.replace(/\s/g, '').toLowerCase()].join('|')
  }

  function descriptors(face) {
    return { style: face.style, weight: face.weight, stretch: face.stretch, unicodeRange: face.unicodeRange, display: 'block' }
  }

  function scanSources(sheet) {
    if (scannedSheets.has(sheet)) return
    try {
      const visit = (rules) => {
        for (const rule of rules) {
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            const style = rule.style
            const source = style.getPropertyValue('src').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,
              (_, _quote, url) => 'url("' + new URL(url, sheet.href ?? document.baseURI).href + '")')
            const face = {
              family: familyName(style.getPropertyValue('font-family')),
              style: style.getPropertyValue('font-style') || 'normal',
              weight: style.getPropertyValue('font-weight') || 'normal',
              stretch: style.getPropertyValue('font-stretch') || 'normal',
              unicodeRange: style.getPropertyValue('unicode-range') || 'U+0-10FFFF',
            }
            sources.set(faceKey(face), source)
          } else if (rule.type === CSSRule.IMPORT_RULE) {
            const imported = rule.styleSheet
            if (imported) scanSources(imported)
          } else if ('cssRules' in rule) visit(rule.cssRules)
        }
      }
      visit(sheet.cssRules)
      scannedSheets.add(sheet)
    } catch { /* A cross-origin stylesheet cannot supply a retry source. */ }
  }

  async function loadFace(face, retryFailed) {
    if (!retryFailed || face.status !== 'error') return face.load()
    const existing = retries.get(face)
    if (existing) return existing
    for (const sheet of document.styleSheets) scanSources(sheet)
    const source = sources.get(faceKey(face))
    if (!source) return face.load()
    // A failed face retains its rejected promise. Stage a fresh request, then
    // register only the successfully decoded face so a retry cannot affect paint.
    const attempt = (attempts.get(face) ?? 0) + 1
    attempts.set(face, attempt)
    // WebKit can retain a failed font resource by URL. Each retry bypasses
    // that failed entry while normal visits keep the immutable URL.
    const retrySource = source.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_, _quote, value) => {
      const url = new URL(value, document.baseURI)
      if (url.protocol === 'http:' || url.protocol === 'https:') url.searchParams.set('__onpaper_font_retry', String(attempt))
      return 'url("' + url.href + '")'
    })
    const fresh = new FontFace(face.family, retrySource, descriptors(face))
    const pending = fresh.load().then(loaded => {
      replacements.set(face, loaded)
      document.fonts.add(loaded)
      return loaded
    }).finally(() => { retries.delete(face) })
    retries.set(face, pending)
    return pending
  }

  function arePageFontsLoaded(content) {
    if (!document.fonts) return false
    try { return requiredFaces(content).every(face => face.status === 'loaded') }
    catch { return false }
  }

  async function preparePageFonts(content, retryFailed = false) {
    if (!document.fonts) return
    const faces = requiredFaces(content)
    await Promise.all(faces.map(face => loadFace(face, retryFailed)))
  }

  const preloads = new Map()

  async function preloadPageFonts(content) {
    for (const sheet of document.styleSheets) scanSources(sheet)
    await Promise.all(requiredFaces(content).filter(face => face.status !== 'loaded').map(face => {
      const url = sources.get(faceKey(face))?.match(/url\(\s*['"]?([^'"\)\s]+)['"]?\s*\)/i)?.[1]
      if (!url) return
      if (preloads.has(url)) return preloads.get(url)
      // Fetch the bytes without activating a font on the outgoing document.
      // Decoding and registration happen after the router installs the new DOM.
      const pending = fetch(url, { mode: 'cors', credentials: 'same-origin', priority: 'low' })
        .then(async response => {
          if (!response.ok) throw new Error('Font preload interrupted')
          await response.arrayBuffer()
        }).catch(error => { preloads.delete(url); throw error })
      preloads.set(url, pending)
      return pending
    }))
  }

  window.__onpaperFonts = { preloadPageFonts }

  let content = null
  let version = 0
  let retryTimer
  let failures = 0
  let contentReady = false
  const retryDelays = [1000, 2500, 5000, 15000, 30000]

  function activateFonts() {
    document.documentElement.dataset.fontState = 'ready'
    document.dispatchEvent(new Event('onpaper:fonts-ready'))
    if (!contentReady) {
      contentReady = true
      document.dispatchEvent(new Event('onpaper:content-ready'))
    }
  }

  async function loadFonts(retryFailed = false) {
    const current = ++version
    const root = document.documentElement
    const main = document.getElementById('main')
    window.clearTimeout(retryTimer)
    if (!main) return
    if (arePageFontsLoaded(document.body)) { activateFonts(); return }
    root.dataset.fontState = 'loading'
    try {
      await preparePageFonts(document.body, retryFailed)
      if (current !== version || root !== document.documentElement || main !== content) return
      if (!arePageFontsLoaded(document.body)) { void loadFonts(); return }
      failures = 0
      activateFonts()
    } catch {
      if (current !== version || root !== document.documentElement || main !== content) return
      // Keep the first visible text in the configured fonts; retry silently.
      const delay = retryDelays[Math.min(failures++, retryDelays.length - 1)]
      if (navigator.onLine) retryTimer = window.setTimeout(() => { void loadFonts(true) }, delay)
    }
  }

  function initFonts() {
    const main = document.getElementById('main')
    if (main === content && contentReady) return
    content = main
    contentReady = false
    failures = 0
    void loadFonts(true)
  }

  document.addEventListener('astro:before-swap', event => {
    ++version
    window.clearTimeout(retryTimer)
    contentReady = false
    const root = event.newDocument.documentElement
    // Reuse complete batches; never paint a partially prepared incoming page.
    root.dataset.fontState = arePageFontsLoaded(event.newDocument.body) ? 'ready' : 'loading'
    root.setAttribute('data-font-navigation', '')
  })
  // Wait for the router to finish installing styles before retrying failed faces.
  document.addEventListener('astro:page-load', () => { window.setTimeout(initFonts, 0) })
  window.addEventListener('online', () => { failures = 0; void loadFonts(true) })
  window.addEventListener('pageshow', event => { if (event.persisted) { failures = 0; void loadFonts(true) } })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFonts, { once: true })
  else initFonts()

})()
