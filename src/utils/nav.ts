import { siteConfig } from '@/config'
import { t } from '@/i18n'

/** "文章" covers the home list, its pages and every article; other sections match by prefix. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/page/') || pathname.startsWith('/posts/')
  return pathname.startsWith(href)
}

export interface NavItem {
  href: string
  active: boolean
  /** The label, in the language the site is built in. */
  label: string
}

type Configured = (typeof siteConfig.nav)[number]

/**
 * The navigation, with each item's label resolved through the dictionary.
 *
 * An item names a dictionary key (`key: 'home'`) so the label follows the
 * configured language; an item may carry a literal `label` instead, for a nav
 * entry of the author's own that has no translation.
 */
export function navItems(pathname: string): NavItem[] {
  return siteConfig.nav.map((item: Configured) => ({
    href: item.href,
    active: isNavActive(item.href, pathname),
    label: item.key ? t(`nav.${item.key}`) : item.label ?? item.href,
  }))
}
