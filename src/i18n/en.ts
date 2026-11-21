/**
 * English interface copy. Mirrors zh.ts key for key — see the note there.
 */
import type { ZhDictionary } from './zh'

export const en: ZhDictionary = {
  htmlLang: 'en',
  ogLocale: 'en_US',

  nav: {
    home: 'Writing',
    tags: 'Archive',
    about: 'About',
    friends: 'Friends',
  },

  common: {
    siteHome: 'home',
    back: 'Back',
    search: 'Search',
    close: 'Close',
    loading: 'Loading…',
    empty: 'Nothing here yet.',
  },

  search: {
    title: 'Search posts',
    placeholder: 'Search titles, tags or text…',
    keyword: 'Search term',
    closeEsc: 'Close search (Esc)',
    hint: 'Search titles, descriptions, tags and body text.',
    indexing: 'Building index…',
    indexFailed: 'Could not load the search index. Try reloading the page.',
    indexFailedShort: 'Could not load the search index',
    results: (count) => `${count} result${count === 1 ? '' : 's'}`,
    resultsTemplate: '{n} results',
    noResults: (query) => `No posts matching “${query}”.`,
    noResultsTemplate: 'No posts matching “{q}”.',
  },

  toc: {
    title: 'Contents',
    article: 'Table of contents',
    sections: 'Article sections',
    expand: 'Expand the table of contents',
  },

  theme: {
    toggle: 'Switch light or dark theme',
    light: 'Light',
    dark: 'Dark',
    auto: 'Auto',
  },

  language: {
    toggle: 'Change language',
    label: 'Language',
    zh: '中文',
    en: 'English',
  },

  pagination: {
    label: 'Pagination',
    previous: 'Previous',
    next: 'Next',
    page: (page) => `Page ${page}`,
  },

  article: {
    backToTop: 'Back to top',
    share: 'Share this post',
    copyLink: 'Copy link',
    copied: 'Copied',
    copyCitation: 'Copy citation',
    citationCopied: 'Citation copied',
    shareCard: 'Create a share card',
    print: 'Print / save as PDF',
    readingTime: (minutes) => `${minutes} min read`,
    views: (count) => `${count} view${count === 1 ? '' : 's'}`,
    viewSuffix: 'views',
    updated: 'Updated',
    tags: 'Tags',
    endMarker: 'End of post',
    tocOpen: 'Open contents',
  },

  card: {
    button: 'Share card',
    print: 'Print / save as PDF',
    cite: 'Copy citation',
    cited: 'Copied',
    citeFailed: 'Could not copy',
    dialogTitle: 'Share card',
    close: 'Close the share card',
    closeShort: 'Close',
    hint: 'Select a passage in the post before opening, and the card uses your selection; otherwise it uses the post description.',
    generating: 'Creating card…',
    failed: 'Could not create the card. Try again.',
    tip: 'On a phone, press and hold the image to save it.',
    save: 'Save image',
    alt: (title) => `Share card: ${title}`,
    scanToRead: 'Scan to read',
  },

  share: {
    label: 'Share to',
    article: 'Share this post',
    x: 'Share on X',
    telegram: 'Share on Telegram',
    weibo: 'Share on Weibo',
    threads: 'Share on Threads',
    instagram: 'Share on Instagram',
    wechat: 'Share on WeChat',
    wechatTitle: 'WeChat',
    weiboTitle: 'Weibo',
    copy: 'Copy link',
    copied: 'Copied',
    copyFailed: 'Could not copy',
  },

  home: {
    pinned: 'Pinned',
    latest: 'Latest',
    readMore: 'Read more',
    allPosts: 'All posts',
    noPosts: 'No posts yet.',
    totalPosts: (count) => `${count} post${count === 1 ? '' : 's'} in total`,
    pageTitle: (page) => `Page ${page}`,
  },

  aside: {
    label: 'Recently and this site',
    now: 'Recently',
    facts: 'This site',
    shelf: 'Shelf',
  },

  facts: {
    posts: 'Posts',
    words: 'Words',
    written: 'Writing for',
    days: 'days',
    unit: '',
    wordUnit: '',
    tenThousand: 'k',
  },

  shelf: {
    title: 'Shelf',
    books: 'Books',
    films: 'Films',
    music: 'Music',
    booksLead: 'Books I have read, mean to reread, and would hand to a friend.',
    filmsLead: 'Films I have watched, will watch again, and would hand to a friend.',
    musicLead: 'Records and songs on repeat, worth passing on.',
    booksHeading: 'Books',
    filmsHeading: 'Films',
    musicHeading: 'Music',
    allLists: 'Books · Films · Music',
    otherLists: 'Other lists',
    wroteAbout: 'Wrote about it',
    wroteAboutShort: 'Wrote',
    credit: 'Book and film covers come from Douban and are used only as a personal record. Rights in the covers and summaries belong to Douban, the publishers and the distributors.',
    empty: 'Nothing on this shelf yet.',
    lead: 'Read, watched and played over and over — the ones worth passing on.',
    categories: 'Categories',
    indexTitle: 'Books · Films · Music',
    booksTitle: 'Books',
    filmsTitle: 'Films',
    musicTitle: 'Music',
    bookHeading: 'Books',
    filmHeading: 'Films',
    musicHeading: 'Music',
    backToFirst: (title) => `Back to the first page of ${title}`,
    pageOf: (page) => `Page ${page}`,
    pagedTitle: (title, page) => `${title} · page ${page}`,
  },

  now: {
    title: 'Recently',
    pageTitle: 'Recently, and this site',
    description: 'Listening, reading, watching — and a few numbers about this site.',
    lead: 'Listening, reading, watching, and the numbers this site has written down.',
  },

  tags: {
    title: 'Archive',
    allTags: 'All tags',
    postsWith: (tag) => `Posts tagged “${tag}”`,
    count: (count) => `${count} post${count === 1 ? '' : 's'}`,
    empty: 'No posts yet.',
    description: 'Every post in order, plus an index by tag.',
    yearsToNow: (year) => `${year} to now`,
    year: (year) => String(year),
    total: (count) => `, ${count} post${count === 1 ? '' : 's'} in all.`,
    otherTags: 'Other tags',
    taggedTitle: (tag) => `Tag: ${tag}`,
    taggedDescription: (tag) => `Every post tagged “${tag}”.`,
    taggedCount: (count) => `${count} post${count === 1 ? '' : 's'} under this tag.`,
  },

  friends: {
    title: 'Friends',
    description: 'Some blogs and people worth reading.',
    lead: 'Personal blogs I drop in on. In no particular order — may we all keep writing at our own pace.',
    missing: 'Friends list is missing: src/content/pages/friends.md',
    opensNewWindow: '(opens in a new window)',
  },

  about: {
    title: 'About',
    description: 'About this site, about writing, and about a few questions without answers.',
  },

  footer: {
    poweredBy: 'Built with Astro',
    rss: 'RSS',
  },

  notFound: {
    title: 'Page not found',
    description: 'There is no page at this address. The link may be wrong, or the post may have been removed.',
    backHome: 'Back to home',
    heading: 'This page is left blank.',
    lead: 'Whatever you were looking for may have moved, or may never have been written down. The post list or the archive is a good place to start again.',
    toPosts: 'Back to all posts',
    toArchive: 'Open the archive',
  },

  zoom: {
    open: 'View full size',
    close: 'Close the image (×)',
    stage: 'Scroll to zoom, drag to pan, double-click to reset',
    group: 'Image zoom',
    out: 'Zoom out (−)',
    in: 'Zoom in (+)',
    reset: 'Reset to actual size (1:1)',
    enlarged: (alt) => `Enlarged image: ${alt}`,
    fallbackAlt: 'Post image',
  },

  shelfMore: {
    all: 'See all',
    more: 'And',
    expand: 'show',
    unit: { book: 'more', film: 'more', music: 'more' },
    empty: 'This list is still empty.',
    pagination: (heading) => `${heading} pages`,
  },

  tagIndex: {
    defaultTitle: 'By tag',
    separator: ', ',
    unit: 'posts',
  },

  code: {
    copy: 'Copy',
    copyLabel: 'Copy code',
    copied: 'Copied',
    failed: 'Could not copy',
  },

  skip: {
    toContent: 'Skip to content',
  },

  redirect: {
    title: (site) => `Redirecting home · ${site}`,
    going: 'Taking you back home…',
  },
}
