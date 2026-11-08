// Share the critical inline runtime with client navigation.
interface FontPreloadOptions { signal?: AbortSignal, priority?: 'high' | 'low' | 'auto' }
declare global {
  interface Window {
    __onpaperFonts?: { preloadPageFonts(content: ParentNode, options?: FontPreloadOptions): Promise<void>, prepareNavigationFonts(content: ParentNode, options?: FontPreloadOptions): Promise<void>, prepareTextFonts(content: ParentNode): Promise<void>, start(): void }
  }
}

export function preloadPageFonts(content: ParentNode, options?: FontPreloadOptions) {
  return window.__onpaperFonts?.preloadPageFonts(content, options) ?? Promise.resolve()
}

export function prepareTextFonts(content: ParentNode) {
  return window.__onpaperFonts?.prepareTextFonts(content) ?? Promise.resolve()
}

export function prepareNavigationFonts(content: ParentNode, options?: FontPreloadOptions) {
  return window.__onpaperFonts?.prepareNavigationFonts(content, options) ?? Promise.resolve()
}
