let activeMotion: Animation | undefined

export function cancelContentMotion() {
  activeMotion?.cancel()
  activeMotion = undefined
}

// Animate live content after it is ready. Document snapshots block hit testing
// and can capture an entire long article while its fonts are still hidden.
export function animateContent(fromOpacity = 0.72) {
  cancelContentMotion()
  const content = document.getElementById('main')
  const state = document.documentElement.dataset.fontState
  if (!content || state === 'loading' || state === 'error'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const motion = content.animate([{ opacity: fromOpacity }, { opacity: 1 }], {
    duration: 140,
    easing: 'ease-out',
  })
  activeMotion = motion
  motion.finished.then(() => {
    if (activeMotion === motion) activeMotion = undefined
  }, () => {})
}
