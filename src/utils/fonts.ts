// Share the critical inline runtime with client navigation.
declare global {
  interface Window {
    __onpaperFonts?: { preloadPageFonts(content: ParentNode): Promise<void> }
  }
}

export function preloadPageFonts(content: ParentNode) {
  return window.__onpaperFonts?.preloadPageFonts(content) ?? Promise.resolve()
}
