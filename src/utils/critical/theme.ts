import type { TransitionBeforePreparationEvent } from 'astro:transitions/client'

const STORAGE_KEY = 'onpaper-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
let activeTransition: ReturnType<Document['startViewTransition']> | undefined
let requestedTheme: boolean | undefined
let changeVersion = 0
let colorTimer: ReturnType<typeof setTimeout> | undefined
// WebKit snapshots can retain font resources after a client-side swap.
const usesWebKit = /AppleWebKit/.test(navigator.userAgent)
  && !/(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent)

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  }
  catch {
    return null
  }
}

function defaultMode() {
  return document.documentElement.dataset.defaultMode || 'auto'
}

function resolveIsDark() {
  const stored = readStored()
  if (stored) return stored === 'dark'
  const mode = defaultMode()
  if (mode === 'light' || mode === 'dark') return mode === 'dark'
  return media.matches
}

function setTheme(isDark: boolean) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  requestAnimationFrame(() => {
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
    if (paper) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper)
  })
}

function applyTheme(isDark: boolean, persist = true) {
  setTheme(isDark)
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light') } catch {}
  }
  document.dispatchEvent(new Event('theme-changed'))
}

function cancelThemeTransition() {
  ++changeVersion
  const previous = activeTransition
  previous?.skipTransition()
  activeTransition = undefined
  requestedTheme = undefined
  window.clearTimeout(colorTimer)
  document.documentElement.classList.remove('theme-changing', 'theme-color-changing')
}

function switchTheme(button: Element) {
  const nextDark = !(requestedTheme ?? (document.documentElement.dataset.theme === 'dark'))
  cancelThemeTransition()
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    applyTheme(nextDark)
    return
  }
  if (!document.startViewTransition || usesWebKit) {
    const root = document.documentElement
    root.classList.add('theme-color-changing')
    getComputedStyle(document.body).backgroundColor
    applyTheme(nextDark)
    colorTimer = window.setTimeout(() => root.classList.remove('theme-color-changing'), 320)
    return
  }

  const current = changeVersion
  requestedTheme = nextDark
  const root = document.documentElement
  const rect = button.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  root.classList.add('theme-changing')
  const transition = document.startViewTransition(() => {
    if (current === changeVersion) applyTheme(nextDark)
  })
  activeTransition = transition
  void transition.ready.then(() => {
    if (current !== changeVersion) return
    root.animate({
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${radius}px at ${x}px ${y}px)`,
      ],
    }, {
      duration: 480,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      pseudoElement: '::view-transition-new(root)',
    })
  }).catch(() => {})
  const cleanup = () => {
    if (activeTransition !== transition) return
    activeTransition = undefined
    requestedTheme = undefined
    root.classList.remove('theme-changing')
  }
  void transition.finished.then(cleanup, cleanup)
}

function initTheme() {
  setTheme(resolveIsDark())
}

function onSystemThemeChange() {
  if (readStored() || defaultMode() !== 'auto') return
  setTheme(media.matches)
  document.dispatchEvent(new Event('theme-changed'))
}

initTheme()
document.addEventListener('astro:page-load', initTheme)
document.addEventListener('astro:before-preparation', (event: TransitionBeforePreparationEvent) => {
  const transition = activeTransition
  if (!transition) {
    window.clearTimeout(colorTimer)
    document.documentElement.classList.remove('theme-color-changing')
    return
  }
  const load = event.loader
  event.loader = async () => {
    // Let the reveal release its snapshots before the router replaces the DOM.
    await transition.finished.catch(() => {})
    await new Promise(resolve => requestAnimationFrame(resolve))
    if (!event.signal.aborted) await load()
  }
})
if (typeof media.addEventListener === 'function') media.addEventListener('change', onSystemThemeChange)
else media.addListener(onSystemThemeChange)

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('[data-theme-toggle]'))
    return

  switchTheme(target.closest('[data-theme-toggle]')!)
})

export {}
