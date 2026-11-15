let measuredWidth = -1
let resizeFrame = 0
let scrollFrame = 0
let lastY = 0
let travel = 0

function measureBarHeight() {
  const bar = document.querySelector<HTMLElement>('[data-mobile-bar]')
  if (!bar) return
  if (window.innerWidth > 1100) { measuredWidth = window.innerWidth; return }
  // Never measure the live bar while it is sliding away. A hidden copy at
  // rest keeps the content spacer stable at full height.
  const probe = bar.cloneNode(true) as HTMLElement
  probe.removeAttribute('data-mobile-bar')
  probe.classList.remove('is-hidden')
  probe.setAttribute('data-bar-measuring', '')
  probe.setAttribute('aria-hidden', 'true')
  probe.inert = true
  probe.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'))
  bar.after(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  document.documentElement.style.setProperty('--mobile-bar-height', height + 'px')
  measuredWidth = window.innerWidth
}

// Reading downwards gives the bar's height back to the text; any upward
// scroll, the top of the page or keyboard focus inside the bar returns it.
function updateBar() {
  const bar = document.querySelector<HTMLElement>('[data-mobile-bar]')
  if (!bar) return
  const y = Math.max(0, window.scrollY)
  const delta = y - lastY
  lastY = y
  bar.classList.toggle('is-scrolled', y > 8)
  if (window.innerWidth > 1100 || y < 96 || bar.contains(document.activeElement) || document.body.classList.contains('search-open')) {
    travel = 0
    bar.classList.remove('is-hidden')
    return
  }
  // Ignore jitter: hide after a deliberate 24px downwards, show on 12px up.
  travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta
  if (travel > 24) bar.classList.add('is-hidden')
  else if (travel < -12) bar.classList.remove('is-hidden')
}

function refreshBar() {
  measureBarHeight()
  updateBar()
}

function onScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updateBar() })
}

function onResize() {
  // Mobile browser toolbars change viewport height while scrolling. They do
  // not change the bar's layout width and must not rewrite its spacer.
  if (window.innerWidth === measuredWidth || resizeFrame) return
  resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; refreshBar() })
}

document.addEventListener('astro:page-load', () => { lastY = window.scrollY; travel = 0; refreshBar() })
document.addEventListener('focusin', (event) => {
  if ((event.target as Element | null)?.closest?.('[data-mobile-bar]')) document.querySelector('[data-mobile-bar]')?.classList.remove('is-hidden')
})
document.addEventListener('onpaper:fonts-ready', refreshBar)
window.addEventListener('scroll', onScroll, { passive: true })
window.addEventListener('resize', onResize, { passive: true })
document.fonts?.ready.then(refreshBar)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshBar, { once: true })
}
else {
  refreshBar()
}

export {}
