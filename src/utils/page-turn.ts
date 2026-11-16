/**
 * The page-turn sheet is drawn by BaseLayout, but the router (which decides
 * when to swap documents) lives in navigation.ts. This module is the one
 * hand-off between them, so neither has to know about the other:
 *
 * - `holdSwapForCover` gives the router the promise that resolves when the
 *   sheet is fully over the old page; the router waits for it before
 *   swapping, or the old page would vanish while the new one is still bare.
 * - `releaseTurn` is called once the incoming document, styles and glyphs
 *   are resident — the point from which the new page can paint complete.
 * - `whenTurnReady` lets BaseLayout wait for that and only then turn the
 *   sheet away.
 */
let down: Promise<void> = Promise.resolve()
let ready = false
let waiting: Array<() => void> = []

export function holdSwapForCover(promise: Promise<void>) {
  down = promise
  ready = false
}

/** Resolves once the router may swap; at once if no turn is running. */
export async function coverIsDown() {
  await down.catch(() => {})
}

/** The incoming page can now paint in full. */
export function releaseTurn() {
  ready = true
  for (const resolve of waiting.splice(0)) resolve()
}

/**
 * Run `turn` a frame after the new page is ready. The event fires while the
 * swap callback is still running, before the browser has painted the new
 * document; turning on that same frame lifted the sheet onto a page that was
 * still blank, so the reveal has to wait for the paint to land.
 */
export function whenTurnReady(turn: () => void) {
  const run = () => requestAnimationFrame(() => requestAnimationFrame(() => turn()))
  if (ready) {
    ready = false
    run()
    return
  }
  waiting.push(() => { ready = false; run() })
}
