// Once per visit, when the page is first revealed, the site name is brushed
// on character by character in reading order, then its verse is written out
// beside it. The text itself never animates (see uncover below).
// Reduced motion skips it.
const KEY = 'onpaper:inked'
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function inkWordmark() {
  let seen = true
  try {
    seen = sessionStorage.getItem(KEY) === '1'
    sessionStorage.setItem(KEY, '1')
  }
  catch {}
  if (seen) return

  const mark = [...document.querySelectorAll<HTMLElement>('[data-wordmark]')]
    .find(element => element.getClientRects().length > 0)
  const line = mark?.querySelector<HTMLElement>('.rail-wordmark__cn')
  if (!line) return
  const vertical = getComputedStyle(line).writingMode.startsWith('vertical')
  const chars = [...line.querySelectorAll<HTMLElement>(':scope > span')]
  // Each character is uncovered in the direction it is read (top to bottom
  // on the spine, left to right in the bar), like one brush stroke.
  chars.forEach((char, index) => {
    uncover(char, vertical, 560, 120 + index * 170, 'cubic-bezier(0.65, 0, 0.35, 1)')
  })
  // Then the verse is written out beside it, one character at a time.
  const verse = [...document.querySelectorAll<HTMLElement>('.rail-subtitle__lines > span > span')]
    .filter(element => element.getClientRects().length > 0)
  const verseStart = 120 + chars.length * 170 + 160
  verse.forEach((element, index) => {
    uncover(element, true, 260, verseStart + index * 55, SETTLE)
  })
}

// The characters themselves are never animated. Any animation on text,
// even clip-path, can move it into its own compositing layer, where it is
// drawn with different antialiasing until the next page redraws it, which
// reads as a twitch on the first navigation. Instead, a cover in the
// panel's own colour sits over each character and shrinks away.
function uncover(char: HTMLElement, vertical: boolean, duration: number, delay: number, easing: string) {
  const cover = document.createElement('i')
  cover.className = 'ink-cover'
  cover.setAttribute('aria-hidden', 'true')
  cover.dataset.transient = ''
  char.append(cover)
  const motion = cover.animate([
    { transform: vertical ? 'scaleY(1)' : 'scaleX(1)' },
    { transform: vertical ? 'scaleY(0)' : 'scaleX(0)' },
  ], { duration, delay, easing, fill: 'both' })
  const done = () => cover.remove()
  motion.finished.then(done, done)
}

function opening() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  inkWordmark()
}

document.addEventListener('onpaper:fonts-ready', opening, { once: true })

export {}
