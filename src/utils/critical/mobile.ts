let measuredWidth = -1
let resizeFrame = 0
let scrollFrame = 0

function measureBarHeight() {
  const bar = document.querySelector<HTMLElement>('[data-mobile-bar]')
  if (!bar) return
  if (window.innerWidth > 1100) { measuredWidth = window.innerWidth; return }
  // Never measure the live bar while its compact transition is running.
  // A hidden, expanded copy keeps the content spacer stable at full height.
  const probe = bar.cloneNode(true) as HTMLElement
  probe.removeAttribute('data-mobile-bar')
  probe.classList.remove('is-compact')
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

function updateBar() {
  const bar = document.querySelector<HTMLElement>('[data-mobile-bar]')
  if (!bar) return
  const y = window.scrollY
  bar.classList.toggle('is-scrolled', y > 8)

  if (bar.dataset.articleBar === 'true') {
    if (y <= 24) bar.classList.remove('is-compact')
    else if (y > 120) bar.classList.add('is-compact')
  }
  else {
    bar.classList.remove('is-compact')
  }
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

document.addEventListener('astro:page-load', refreshBar)
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
