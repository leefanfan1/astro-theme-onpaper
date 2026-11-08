// Runs inline before first paint, independently of page modules.
;(() => {
  if (window.__onpaperFonts || !document.fonts) return
  document.documentElement.dataset.fontState = 'loading'

  const ranges = new WeakMap()
  const sources = new Map()
  const scannedSheets = new WeakSet()
  const attempts = new Map()
  const recoveredRules = new Map()
  const stableCallbacks = new Set()
  const bodyLoads = new WeakMap()
  let recoveryStyle
  let fontWork = Promise.resolve()
  let nativeLoads = Promise.resolve()
  let changingPage = false
  let transition = 0

  function whenPageStable() {
    if (!changingPage) return Promise.resolve()
    return new Promise(resolve => stableCallbacks.add(resolve))
  }

  function familyName(family) {
    return family.trim().replace(/^['"]|['"]$/g, '')
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
    const batches = new Map()
    for (const face of document.fonts) {
      if (families.has(familyName(face.family))) batches.set(faceKey(face), face)
    }
    const faces = [...batches.values()]
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

  function recoverFaces(faces) {
    for (const sheet of document.styleSheets) scanSources(sheet)
    let changed = false
    for (const face of faces) {
      const key = faceKey(face)
      if (face.status !== 'error' && !(recoveredRules.has(key) && face.status === 'unloaded')) continue
      const source = sources.get(key)
      if (!source) continue
      const attempt = (attempts.get(key) ?? 0) + 1
      attempts.set(key, attempt)
      const retrySource = source.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_, _quote, value) => {
        const url = new URL(value, document.baseURI)
        if (url.protocol === 'http:' || url.protocol === 'https:') url.searchParams.set('__onpaper_font_retry', String(attempt))
        return 'url("' + url.href + '")'
      })
      recoveredRules.set(key, '@font-face{font-family:' + JSON.stringify(familyName(face.family))
        + ';src:' + retrySource + ';font-style:' + face.style + ';font-weight:' + face.weight
        + ';font-stretch:' + face.stretch + ';unicode-range:' + face.unicodeRange + ';font-display:block}')
      changed = true
    }
    if (!changed) return
    if (!recoveryStyle) {
      recoveryStyle = document.createElement('style')
      recoveryStyle.setAttribute('data-astro-transition-persist', 'onpaper-font-recovery')
    }
    // Update one sheet atomically, before starting any font loads. WebKit can
    // invalidate CSS face handles if separate sheets change during a batch.
    recoveryStyle.textContent = [...recoveredRules.values()].join('\n')
    if (!recoveryStyle.isConnected) document.head.append(recoveryStyle)
    getComputedStyle(document.body).fontFamily
  }

  function arePageFontsLoaded(content) {
    try { return requiredFaces(content).every(face => face.status === 'loaded') }
    catch { return false }
  }

  function preparePageFonts(content, retryFailed = false) {
    const existing = bodyLoads.get(content)
    if (existing) return existing
    const pending = fontWork.catch(() => {}).then(async () => {
      await whenPageStable()
      if (!content.isConnected) return
      if (retryFailed) recoverFaces(requiredFaces(content))
      // Finish the complete batch before changing recovery CSS again.
      nativeLoads = Promise.allSettled(requiredFaces(content).map(face => face.load()))
      const results = await nativeLoads
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    })
    fontWork = pending
    bodyLoads.set(content, pending)
    const clear = () => { if (bodyLoads.get(content) === pending) bodyLoads.delete(content) }
    pending.then(clear, clear)
    return pending
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

  function resumeFonts() {
    changingPage = false
    for (const resolve of stableCallbacks) resolve()
    stableCallbacks.clear()
    initFonts()
  }

  document.addEventListener('astro:before-preparation', event => {
    const current = ++transition
    changingPage = true
    const load = event.loader
    const outgoingLoads = nativeLoads
    event.loader = async () => {
      await outgoingLoads
      await document.fonts.ready
      if (!event.signal.aborted) await load()
    }
    ++version
    window.clearTimeout(retryTimer)
    event.signal.addEventListener('abort', () => {
      window.setTimeout(() => { if (current === transition) resumeFonts() }, 0)
    }, { once: true })
  })

  document.addEventListener('astro:before-swap', event => {
    ++version
    window.clearTimeout(retryTimer)
    contentReady = false
    const root = event.newDocument.documentElement
    if (recoveryStyle?.isConnected) event.newDocument.head.append(recoveryStyle.cloneNode(true))
    // Reuse complete batches; never paint a partially prepared incoming page.
    root.dataset.fontState = arePageFontsLoaded(event.newDocument.body) ? 'ready' : 'loading'
    root.setAttribute('data-font-navigation', '')
  })
  // Wait for the router to finish installing styles before retrying failed faces.
  document.addEventListener('astro:page-load', () => {
    const current = transition
    window.setTimeout(() => { if (current === transition) resumeFonts() }, 0)
  })
  window.addEventListener('online', () => { failures = 0; void loadFonts(true) })
  window.addEventListener('pageshow', event => { if (event.persisted) { failures = 0; void loadFonts(true) } })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFonts, { once: true })
  else initFonts()

})()
