let activeMotions: Animation[] = []

export function cancelContentMotion() {
  activeMotions.forEach(motion => motion.cancel())
  activeMotions = []
}

// Start on the live incoming content as soon as it is ready. These animations
// never delay navigation or put a snapshot layer over interactive controls.
export function animateContent(kind: 'navigation' | 'theme' = 'navigation') {
  const content = document.getElementById('main')
  if (kind === 'navigation') cancelContentMotion()
  else {
    // A theme click during an entrance must not snap its moving blocks back.
    activeMotions = activeMotions.filter(motion => {
      if (!(motion.effect instanceof KeyframeEffect) || motion.effect.target !== content) return true
      motion.cancel()
      return false
    })
  }
  if (document.documentElement.dataset.fontState === 'loading') return
  if (!content || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const navigation = kind === 'navigation'
  const timing: KeyframeAnimationOptions = {
    duration: navigation ? 260 : 180,
    easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  }
  const motions = [content.animate([
    { opacity: navigation ? 0.24 : 0.65 },
    { opacity: 1 },
  ], timing)]

  if (navigation) {
    // Move only normal content blocks. Transforming main or article would
    // relocate their fixed back link, reading progress and desktop outline.
    const blocks = content.querySelectorAll<HTMLElement>([
      ':scope > :not(.article, .reading-progress, .sr-only, script, style, link)',
      ':scope > .article > :is(.article-header, .toc--mobile, .prose, .article-footer)',
    ].join(', '))
    for (const block of blocks) {
      motions.push(block.animate([
        { transform: 'translateY(10px)' },
        { transform: 'translateY(0)' },
      ], timing))
    }
  }

  activeMotions.push(...motions)
  void Promise.allSettled(motions.map(motion => motion.finished)).then(() => {
    activeMotions = activeMotions.filter(motion => !motions.includes(motion))
  })
}
