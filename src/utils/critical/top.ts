function updateBackToTop() {
  const button = document.querySelector('[data-back-to-top]')
  if (!button) return
  button.classList.toggle('is-visible', window.scrollY > 650)
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('[data-back-to-top]')) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
})

document.addEventListener('astro:page-load', updateBackToTop)
window.addEventListener('scroll', updateBackToTop, { passive: true })
updateBackToTop()

export {}
