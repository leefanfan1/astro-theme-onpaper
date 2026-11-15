/** "文章" covers the home list, its pages and every article; other sections match by prefix. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/page/') || pathname.startsWith('/posts/')
  return pathname.startsWith(href)
}
