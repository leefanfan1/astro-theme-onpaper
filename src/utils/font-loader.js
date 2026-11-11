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
  const preparedPages = new WeakSet()
  const activatedFaces = new Map()
  // These code points affect shaping but have no standalone visible glyph.
  const invisibleCodePoint = /[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Zl}\p{Zp}]/u
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

  function requiredFaces(content, exclude = new Set(), originalFamilies = false) {
    const style = getComputedStyle(document.documentElement)
    const stacks = ['--font-body-web', '--font-display-web'].map(property =>
      style.getPropertyValue(property).split(',').map(familyName)
        .filter(family => !originalFamilies || !family.startsWith('OnPaper ')))
    const batches = new Map()
    for (const face of document.fonts) {
      const key = faceKey(face)
      if (batches.get(key)?.status !== 'loaded') batches.set(key, face)
    }
    const faces = [...batches.values()].reverse()
    if (!faces.length) throw new Error('Theme font definitions are unavailable')

    const text = new Set()
    const unavailable = new Set(content.ownerDocument?.querySelector('style[data-onpaper-page-fonts]')?.dataset.unavailable ?? '')
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (walker.currentNode.parentElement?.closest('script, style, noscript')) continue
      for (const character of walker.currentNode.textContent ?? '') if (!exclude.has(character) && !unavailable.has(character) && !invisibleCodePoint.test(character)) text.add(character)
    }
    content.querySelectorAll('input, textarea, [title], [alt]').forEach(element => {
      for (const character of (element.getAttribute('placeholder') ?? '') + (element.getAttribute('title') ?? '') + (element.getAttribute('alt') ?? '')) {
        if (!exclude.has(character) && !unavailable.has(character) && !invisibleCodePoint.test(character)) text.add(character)
      }
    })
    const characters = [...text].map(character => character.codePointAt(0))
    const required = new Set()
    for (const stack of stacks) {
      let remaining = characters
      for (const family of stack) {
        if (!remaining.length) break
        const variants = new Map()
        for (const face of faces) {
          if (familyName(face.family) !== family) continue
          const key = [face.style, face.weight, face.stretch].join('|')
          if (!variants.has(key)) variants.set(key, [])
          variants.get(key).push(face)
        }
        const covered = new Set()
        for (const candidates of variants.values()) {
          for (const code of remaining) {
            const face = candidates.find(face => covers(face, [code]))
            if (face) { required.add(face); covered.add(code) }
          }
        }
        remaining = remaining.filter(code => !covered.has(code))
      }
    }
    return [...required]
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

  function preparePageFonts(content, retryFailed = false, detached = false) {
    const existing = bodyLoads.get(content)
    if (existing) return existing
    const pending = (detached ? Promise.resolve() : fontWork.catch(() => {})).then(async () => {
      await whenPageStable()
      if (!detached && !content.isConnected) return
      if (retryFailed) recoverFaces(requiredFaces(content))
      // Finish the complete batch before changing recovery CSS again.
      const loads = Promise.allSettled(requiredFaces(content).map(face => face.load()))
      if (!detached) nativeLoads = loads
      const results = await loads
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    })
    if (!detached) fontWork = pending
    bodyLoads.set(content, pending)
    const clear = () => { if (bodyLoads.get(content) === pending) bodyLoads.delete(content) }
    pending.then(clear, clear)
    return pending
  }

  const preloads = new Map()

  async function preloadPageFonts(content, options = {}) {
    for (const sheet of document.styleSheets) scanSources(sheet)
    const pageFonts = content.ownerDocument.querySelector('style[data-onpaper-page-fonts]')
    const exclude = new Set(pageFonts?.dataset.characters ?? '')
    const urls = new Set([...content.ownerDocument.querySelectorAll('link[data-onpaper-font]')].map(link => link.href))
    for (const face of requiredFaces(content, exclude, Boolean(pageFonts))) {
      if (face.status === 'loaded') continue
      const url = sources.get(faceKey(face))?.match(/url\(\s*['"]?([^'"\)\s]+)['"]?\s*\)/i)?.[1]
      if (url) urls.add(url)
    }
    await Promise.all([...urls].map(url => {
      const existing = preloads.get(url)
      if (existing && !existing.signal?.aborted) return existing.promise
      // Fetch abortable bytes first; decode off-document before activation.
      // A newer click can cancel without touching the live page's fonts.
      const entry = { signal: options.signal, promise: null }
      entry.promise = fetch(url, { mode: 'cors', credentials: 'same-origin', priority: options.priority ?? 'low', signal: options.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Font preload interrupted')
          const bytes = await response.arrayBuffer()
          entry.signal = undefined
          return bytes
        }).catch(error => { if (preloads.get(url) === entry) preloads.delete(url); throw error })
      preloads.set(url, entry)
      return entry.promise
    }))
  }

  const decodedFaces = new Map()
  function discardPreloadedFonts(content) {
    for (const link of content.ownerDocument.querySelectorAll('link[data-onpaper-font]')) {
      preloads.delete(link.href)
    }
  }

  async function decodeNavigationFonts(content, options = {}) {
    await preloadPageFonts(content, options)
    if (options.signal?.aborted) return
    const style = content.ownerDocument.querySelector('style[data-onpaper-page-fonts]')
    if (!style) return
    // Decode outside document.fonts. Preparing another route must never change
    // the currently visible page's family, metrics or font readiness.
    const parsed = document.implementation.createHTMLDocument('')
    const definitions = parsed.createElement('style')
    definitions.textContent = style.textContent
    parsed.head.append(definitions)
    const faces = []
    for (const rule of definitions.sheet.cssRules) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue
      const css = rule.style
      const descriptor = {
        style: css.getPropertyValue('font-style') || 'normal',
        weight: css.getPropertyValue('font-weight') || 'normal',
        stretch: css.getPropertyValue('font-stretch') || 'normal',
        unicodeRange: css.getPropertyValue('unicode-range') || 'U+0-10FFFF',
      }
      const family = familyName(css.getPropertyValue('font-family'))
      const key = faceKey({ family, ...descriptor })
      let face = activatedFaces.get(key) ?? decodedFaces.get(key)
      if (!face) {
        const path = css.getPropertyValue('src').match(/url\(\s*['"]?([^'"\)\s]+)['"]?\s*\)/i)?.[1]
        const bytes = await preloads.get(new URL(path, location.href).href)?.promise
        if (!bytes || options.signal?.aborted) return
        face = new FontFace(family, bytes, descriptor)
        decodedFaces.set(key, face)
      }
      faces.push({ key, face })
    }
    await Promise.all(faces.map(async ({ key, face }) => {
      try { await face.load() }
      catch (error) {
        decodedFaces.delete(key)
        discardPreloadedFonts(content)
        throw error
      }
    }))
    while (decodedFaces.size > 128) decodedFaces.delete(decodedFaces.keys().next().value)
    return { style, definitions, faces }
  }

  async function warmPageFonts(content, options = {}) {
    await decodeNavigationFonts(content, options)
  }

  async function prepareNavigationFonts(content, options = {}) {
    const decoded = await decodeNavigationFonts(content, options)
    if (!decoded || options.signal?.aborted) return
    const { style, definitions, faces } = decoded
    const exclude = new Set(style.dataset.characters ?? '')
    const extraFaces = requiredFaces(content, exclude, true).filter(face => face.status !== 'loaded')
    if (extraFaces.length) {
      recoverFaces(extraFaces)
      nativeLoads = Promise.allSettled(requiredFaces(content, exclude, true).map(face => face.load()))
      const results = await nativeLoads
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    }
    await nativeLoads
    if (options.signal?.aborted) return
    for (const { key, face } of faces) {
      if (!document.fonts.has(face)) {
        document.fonts.add(face)
        activatedFaces.set(key, face)
      }
    }
    // Keep one authoritative loaded face per definition. Reintroducing the CSS
    // faces here would start a second load and discard shared CSS-connected
    // faces when the outgoing page's style element is removed.
    for (const rule of definitions.sheet.cssRules) {
      if (rule.type !== CSSRule.STYLE_RULE || rule.selectorText !== ':root') continue
      for (const property of ['--font-body-web', '--font-display-web']) {
        const value = rule.style.getPropertyValue(property)
        if (value) content.ownerDocument.documentElement.style.setProperty(property, value)
      }
    }
    style.textContent = [...definitions.sheet.cssRules].filter(rule => rule.type !== CSSRule.FONT_FACE_RULE).map(rule => rule.cssText).join('\n')
    content.ownerDocument.querySelectorAll('link[data-onpaper-font]').forEach(link => link.remove())
    preparedPages.add(content)
  }

  let dynamicFonts
  let dynamicLink
  function ensureDynamicFonts() {
    const href = document.querySelector('style[data-onpaper-page-fonts]')?.dataset.dynamicCss
    if (!href) return Promise.resolve()
    if (dynamicFonts && dynamicLink?.isConnected) return dynamicFonts
    const link = document.createElement('link')
    dynamicLink = link
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-astro-transition-persist', 'onpaper-dynamic-fonts')
    dynamicFonts = new Promise((resolve, reject) => {
      link.onload = resolve
      link.onerror = () => { dynamicFonts = null; link.remove(); reject(new Error('Dynamic font definitions unavailable')) }
      document.head.append(link)
    })
    return dynamicFonts
  }

  window.__onpaperFonts = { warmPageFonts, preloadPageFonts, prepareNavigationFonts, prepareTextFonts: async content => { await ensureDynamicFonts(); await preparePageFonts(content, true, true) }, start: () => initFonts() }

  let content = null
  let version = 0
  let retryTimer
  let failures = 0
  let contentReady = false
  const retryDelays = [500, 1000, 2000, 5000, 10000]

  function activateFonts() {
    document.documentElement.dataset.fontState = 'ready'
    document.dispatchEvent(new Event('onpaper:fonts-ready'))
    if (!contentReady) {
      const used = new Set(requiredFaces(document.body).map(faceKey))
      for (const [key, face] of activatedFaces) {
        if (!used.has(key)) { document.fonts.delete(face); activatedFaces.delete(key) }
      }
      // Byte buffers supplement the browser HTTP cache; keep them bounded.
      for (const [url, entry] of preloads) {
        if (preloads.size <= 256) break
        if (!entry.signal) preloads.delete(url)
      }
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
      if (event.signal.aborted) return
      await Promise.all([outgoingLoads, load()])
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
    if (dynamicLink?.isConnected) event.newDocument.head.append(dynamicLink.cloneNode(true))
    if (recoveryStyle?.isConnected) event.newDocument.head.append(recoveryStyle.cloneNode(true))
    // Reuse complete batches; never paint a partially prepared incoming page.
    const incomingFonts = event.newDocument.querySelector('style[data-onpaper-page-fonts]')
    const currentFonts = document.querySelector('style[data-onpaper-page-fonts]')
    const sameDefinitions = incomingFonts?.textContent === currentFonts?.textContent
    root.dataset.fontState = preparedPages.has(event.newDocument.body) || (sameDefinitions && arePageFontsLoaded(event.newDocument.body)) ? 'ready' : 'loading'
    root.setAttribute('data-font-navigation', '')
  })
  // Prepared navigation faces are already active at the swap. Reveal and run
  // the existing entrance animation now, without waiting for article modules.
  document.addEventListener('astro:after-swap', () => {
    if (preparedPages.has(document.body)) resumeFonts()
  })
  // Unprepared pages still wait for the router to install their styles.
  document.addEventListener('astro:page-load', () => {
    const current = transition
    window.setTimeout(() => { if (current === transition) resumeFonts() }, 0)
  })
  window.addEventListener('online', () => { failures = 0; void loadFonts(true) })
  window.addEventListener('pageshow', event => { if (event.persisted) { failures = 0; void loadFonts(true) } })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFonts, { once: true })
  else initFonts()

})()
