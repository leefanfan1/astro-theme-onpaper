let cleanupToc: (() => void) | null = null
let boundToc: Element | null = null

function initToc() {
  const current = document.querySelector('.toc-desktop')
  if (current && current === boundToc) return
  boundToc = current
  cleanupToc?.()
  cleanupToc = null
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')]
  const headings = [...new Set(links.map(link => link.dataset.tocLink))]
    .map(id => document.getElementById(id!))
    .filter((heading): heading is HTMLElement => Boolean(heading))
  if (!headings.length) return

  const desktop = document.querySelector<HTMLElement>('.toc-desktop')
  const toggle = desktop?.querySelector<HTMLButtonElement>('.toc-desktop__title')
  const viewport = desktop?.querySelector<HTMLElement>('.toc-desktop__scroll')
  const inlineLinks = [...(viewport?.querySelectorAll<HTMLAnchorElement>('a') ?? [])]
  const chapters = inlineLinks.filter(link => link.hasAttribute('data-toc-chapter'))
  const canHover = window.matchMedia('(any-hover: hover) and (any-pointer: fine)')
  let expandable = false
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let expanded = false
  let requestedExpanded = false
  let animation: Animation | undefined
  let transitionVersion = 0
  let pinned = false
  let suppressed = false
  let activeId = ''
  let frame = 0
  let measureFrame = 0
  let openTimer: number | undefined
  let closeTimer: number | undefined
  let disposed = false

  const clearTimers = () => {
    window.clearTimeout(openTimer)
    window.clearTimeout(closeTimer)
  }
  const updateEdges = () => {
    if (!viewport) return
    const top = viewport.scrollTop > 2
    const bottom = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 2
    viewport.dataset.overflow = top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : ''
  }
  const revealCurrent = () => {
    // Keep keyboard navigation in view instead of following article scrolling.
    if (!viewport || viewport.contains(document.activeElement)) {
      updateEdges()
      return
    }
    const active = inlineLinks.find(link => link.dataset.tocLink === activeId)
    const target = !expanded && desktop?.hasAttribute('data-height-overflow')
      ? active?.closest('li:has([data-toc-chapter])')?.querySelector<HTMLElement>('[data-toc-chapter]')
      : active
    if (!target) return
    const outer = viewport.getBoundingClientRect()
    const inner = target.getBoundingClientRect()
    if (inner.top < outer.top + 12) viewport.scrollTop += inner.top - outer.top - 12
    else if (inner.bottom > outer.bottom - 12) viewport.scrollTop += inner.bottom - outer.bottom + 12
    updateEdges()
  }
  const applyExpanded = (value: boolean) => {
    expanded = value
    desktop?.toggleAttribute('data-expanded', expanded)
    if (expandable) toggle?.setAttribute('aria-expanded', String(expanded))
    toggle?.setAttribute('aria-label', expanded ? '收起文章目录' : '展开文章目录')
    // Scrolling the list to the active chapter belongs to reading progress
    // (see update); doing it here yanked the rows out from under the pointer
    // every time the outline expanded.
    updateEdges()
  }
  // The row currently at the top of the list, used to hold the reader's
  // place while the outline grows or shrinks. Nested headings have no layout
  // box when the outline is collapsed, so only sized rows qualify.
  const topRow = () => {
    if (!viewport) return null
    const edge = viewport.getBoundingClientRect().top
    return inlineLinks.find(link => {
      const rect = link.getBoundingClientRect()
      return rect.height > 0 && rect.bottom > edge + 1
    }) ?? null
  }
  // Nudge the scroll position so `row` sits where it sat before the change.
  const holdRow = (row: HTMLAnchorElement | null) => {
    if (!viewport || !row) return
    const edge = viewport.getBoundingClientRect().top
    const drift = row.getBoundingClientRect().top - edge - Number(row.dataset.offsetTop ?? 0)
    if (Math.abs(drift) > 1) viewport.scrollTop += drift
  }
  const setExpanded = async (value: boolean, immediate = false) => {
    const next = value && expandable
    if (!next) pinned = false
    if (!immediate && next === requestedExpanded) return
    requestedExpanded = next
    const version = ++transitionVersion
    // The outline animates its own height: the rows slide open and closed at
    // the bottom edge. The earlier version wiped the whole list to blank and
    // drew it back, which left a hole where the navigation had been, and
    // scrolled to the active chapter in between — moving the rows under the
    // pointer. Nothing here hides text, so there is nothing left to flash.
    const from = viewport ? viewport.getBoundingClientRect().height : 0
    animation?.cancel()
    animation = undefined
    if (!viewport || immediate || reducedMotion.matches) {
      viewport?.style.removeProperty('height')
      applyExpanded(next)
      return
    }
    const anchor = topRow()
    if (anchor) anchor.dataset.offsetTop = String(Math.round(anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top))
    // Growing mounts the nested rows first so the box can reach their height.
    // Shrinking leaves them mounted and lets the bottom edge clip them, so no
    // row is pulled out of the page in a single frame.
    if (next) applyExpanded(true)
    viewport.style.height = from + 'px'
    const limit = parseFloat(getComputedStyle(viewport).maxHeight)
    // Collapsing targets the outline without its nested rows: they are still
    // mounted (so the edge can clip them), so their height is subtracted
    // rather than re-measured.
    const nested = next
      ? 0
      : [...viewport.querySelectorAll<HTMLElement>('.toc-desktop__children')]
          .reduce((sum, group) => sum + group.offsetHeight, 0)
    const content = viewport.scrollHeight - nested
    const to = Math.min(content, Number.isFinite(limit) ? limit : content)
    if (Math.abs(to - from) < 1) {
      viewport.style.removeProperty('height')
      if (!next) applyExpanded(false)
      holdRow(anchor)
      updateEdges()
      return
    }
    animation = viewport.animate(
      [{ height: from + 'px' }, { height: to + 'px' }],
      { duration: next ? 240 : 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    )
    try { await animation.finished } catch { return }
    if (disposed || version !== transitionVersion) return
    viewport.style.removeProperty('height')
    animation.cancel()
    animation = undefined
    // Nested rows are only removed once they are already clipped away.
    if (!next) applyExpanded(false)
    holdRow(anchor)
    if (anchor) delete anchor.dataset.offsetTop
    updateEdges()
  }
  const measure = () => {
    measureFrame = 0
    if (!desktop?.getClientRects().length || !viewport) {
      setExpanded(false, true)
      return
    }
    // Measure an invisible copy at the resting width, independently of animation
    // and expansion. One long title must not hide every nested heading.
    const probe = desktop.cloneNode(true) as HTMLElement
    probe.setAttribute('data-measuring', '')
    probe.removeAttribute('data-expanded')
    probe.removeAttribute('data-height-overflow')
    probe.removeAttribute('data-expandable')
    probe.removeAttribute('data-width-overflow')
    probe.removeAttribute('data-wide')
    probe.removeAttribute('aria-label')
    probe.setAttribute('aria-hidden', 'true')
    probe.inert = true
    probe.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
    desktop.after(probe)
    const list = probe.querySelector<HTMLElement>('.toc-desktop__scroll')!
    const heightOverflow = list.scrollHeight > list.clientHeight + 2
    // Measure the text box without link padding; line clamping on a padded
    // link can report overflow even when its two lines are fully visible.
    const widthOverflow = [...list.querySelectorAll<HTMLElement>('.toc-desktop__text')]
      .some(text => text.scrollHeight > text.clientHeight + 2 || text.scrollWidth > text.clientWidth + 2)
    const hiddenChildren = heightOverflow && Boolean(list.querySelector('.toc-desktop__children a'))
    const wrappedTitles = [...list.querySelectorAll<HTMLElement>('.toc-desktop__text')]
      .some(text => text.clientHeight > parseFloat(getComputedStyle(text).lineHeight) + 2)
    probe.remove()
    desktop.toggleAttribute('data-height-overflow', hiddenChildren)
    desktop.toggleAttribute('data-width-overflow', widthOverflow)
    // Only widen an outline that needs revealing; short labels stay narrow.
    desktop.toggleAttribute('data-wide', widthOverflow || (hiddenChildren && wrappedTitles))
    // Scrolling a list of short top-level headings needs no expansion.
    expandable = hiddenChildren || widthOverflow
    desktop.toggleAttribute('data-expandable', expandable)
    if (toggle) {
      toggle.disabled = !expandable
      if (expandable) toggle.setAttribute('aria-expanded', String(expanded))
      else toggle.removeAttribute('aria-expanded')
    }
    if (!expandable) { clearTimers(); setExpanded(false, true) }
    revealCurrent()
  }
  const scheduleMeasure = () => {
    if (!measureFrame) measureFrame = requestAnimationFrame(measure)
  }
  const update = () => {
    frame = 0
    let current = headings[0]
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= window.innerHeight * 0.18) current = heading
      else break
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = headings[headings.length - 1]
    if (activeId === current.id) return
    activeId = current.id
    for (const link of links) {
      if (link.dataset.tocLink === activeId) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
    const active = inlineLinks.find(link => link.dataset.tocLink === activeId)
    const chapter = active?.closest('li:has([data-toc-chapter])')?.querySelector('[data-toc-chapter]')
    for (const link of chapters) link.toggleAttribute('data-active-chapter', link === chapter)
    revealCurrent()
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
  const onEnter = (event: PointerEvent) => {
    clearTimers()
    if (event.pointerType === 'touch') return
    if (canHover.matches && expandable && !suppressed) {
      openTimer = window.setTimeout(() => setExpanded(true), 140)
    }
  }
  const onLeave = () => {
    clearTimers()
    suppressed = false
    if (!pinned && !desktop?.querySelector(':focus-visible')) {
      closeTimer = window.setTimeout(() => setExpanded(false), 260)
    }
  }
  const onFocus = (event: FocusEvent) => {
    clearTimers()
    if (event.target !== toggle) setExpanded(true)
  }
  const onBlur = (event: FocusEvent) => {
    if (!desktop?.contains(event.relatedTarget as Node | null)) {
      clearTimers()
      setExpanded(false)
    }
  }
  const onToggle = () => {
    clearTimers()
    if (pinned) { suppressed = true; setExpanded(false) }
    else { pinned = true; setExpanded(true) }
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || (!expanded && !requestedExpanded)) return
    event.preventDefault()
    suppressed = true
    clearTimers()
    setExpanded(false)
    toggle?.focus({ preventScroll: true })
  }
  const onOutside = (event: PointerEvent) => {
    if (!desktop?.contains(event.target as Node)) { clearTimers(); setExpanded(false) }
  }
  const onClick = (event: MouseEvent) => {
    if (!(event.target as Element).closest('a[href^="#"]')) return
    clearTimers()
    suppressed = true
    setExpanded(false)
  }
  const onResize = () => {
    if (window.innerWidth < 1280) { clearTimers(); setExpanded(false, true) }
    scheduleMeasure()
    onScroll()
  }
  desktop?.addEventListener('pointerenter', onEnter)
  desktop?.addEventListener('pointerleave', onLeave)
  desktop?.addEventListener('focusin', onFocus)
  desktop?.addEventListener('focusout', onBlur)
  desktop?.addEventListener('keydown', onKey)
  desktop?.addEventListener('click', onClick)
  toggle?.addEventListener('click', onToggle)
  viewport?.addEventListener('scroll', updateEdges, { passive: true })
  document.addEventListener('pointerdown', onOutside)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  update()
  measure()
  const resizeObserver = new ResizeObserver(scheduleMeasure)
  resizeObserver.observe(document.documentElement)
  document.fonts.ready.then(() => { if (!disposed) scheduleMeasure() })
  cleanupToc = () => {
    disposed = true
    ++transitionVersion
    animation?.cancel()
    viewport?.style.removeProperty('clip-path')
    clearTimers()
    cancelAnimationFrame(frame)
    cancelAnimationFrame(measureFrame)
    resizeObserver.disconnect()
    desktop?.removeEventListener('pointerenter', onEnter)
    desktop?.removeEventListener('pointerleave', onLeave)
    desktop?.removeEventListener('focusin', onFocus)
    desktop?.removeEventListener('focusout', onBlur)
    desktop?.removeEventListener('keydown', onKey)
    desktop?.removeEventListener('click', onClick)
    toggle?.removeEventListener('click', onToggle)
    viewport?.removeEventListener('scroll', updateEdges)
    document.removeEventListener('pointerdown', onOutside)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
  }
}
document.addEventListener('astro:before-swap', () => { cleanupToc?.(); cleanupToc = null; boundToc = null })
document.addEventListener('astro:page-load', initToc)
// This inline runtime sits after the body markup; external modules may still be pending.
initToc()

export {}
