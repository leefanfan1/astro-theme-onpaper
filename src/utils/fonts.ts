// Share the critical inline runtime with client navigation.
declare global {
  interface Window {
    __onpaperFonts?: { preloadPageFonts(content: ParentNode): Promise<void>, prepareTextFonts(content: ParentNode): Promise<void>, start(): void }
  }
}

export function preloadPageFonts(content: ParentNode) {
  return window.__onpaperFonts?.preloadPageFonts(content) ?? Promise.resolve()
}

export function prepareTextFonts(content: ParentNode) {
  return window.__onpaperFonts?.prepareTextFonts(content) ?? Promise.resolve()
}
