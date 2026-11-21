/**
 * 中文文案。这是基准表：`en.ts` 按这份结构逐条翻译，缺一条都会报类型错误。
 * 键名按界面区块分组，读的时候能一眼看出它出现在页面哪里。
 */
export const zh = {
  htmlLang: 'zh-CN',
  ogLocale: 'zh_CN',

  nav: {
    home: '文章',
    tags: '归档',
    about: '关于',
    friends: '友链',
  },

  common: {
    siteHome: '首页',
    back: '返回',
    search: '搜索',
    close: '关闭',
    loading: '加载中…',
    empty: '还没有内容。',
  },

  search: {
    title: '搜索文章',
    placeholder: '搜索标题、标签或正文…',
    keyword: '搜索关键词',
    closeEsc: '关闭搜索（Esc）',
    hint: '输入关键词，搜索标题、摘要、标签和正文。',
    indexing: '正在建立索引…',
    indexFailed: '搜索索引加载失败，请刷新页面重试。',
    indexFailedShort: '搜索索引加载失败',
    // `{n}` and `{q}` are filled in by the search script, which runs in the
    // browser and cannot call a dictionary function.
    results: (count) => `${count} 条搜索结果`,
    resultsTemplate: '{n} 条搜索结果',
    noResults: (query) => `没有找到与“${query}”相关的文章。`,
    noResultsTemplate: '没有找到与“{q}”相关的文章。',
  },

  toc: {
    title: '目录',
    article: '文章目录',
    sections: '文章章节',
    expand: '展开文章目录',
  },

  theme: {
    toggle: '切换深浅色模式',
    light: '浅色',
    dark: '深色',
    auto: '跟随系统',
  },

  language: {
    toggle: '切换语言',
    label: '语言',
    zh: '中文',
    en: 'English',
  },

  pagination: {
    label: '分页',
    previous: '上一页',
    next: '下一页',
    page: (page) => `第 ${page} 页`,
  },

  article: {
    backToTop: '回到顶部',
    share: '分享这篇文章',
    copyLink: '复制链接',
    copied: '已复制',
    copyCitation: '复制引用',
    citationCopied: '引用已复制',
    shareCard: '生成分享卡片',
    print: '打印 / 存为 PDF',
    readingTime: (minutes) => `约 ${minutes} 分钟读完`,
    views: (count) => `${count} 次阅读`,
    viewSuffix: '次阅读',
    updated: '更新于',
    tags: '文章标签',
    endMarker: '文章结束',
    tocOpen: '展开目录',
  },

  card: {
    button: '分享卡片',
    print: '打印 / 存成 PDF',
    cite: '复制引用',
    cited: '已复制',
    citeFailed: '复制失败',
    dialogTitle: '分享卡片',
    close: '关闭分享卡片',
    closeShort: '关闭',
    hint: '先在正文里选中一段话再打开，卡片会用你选中的句子；否则用文章摘要。',
    generating: '正在生成卡片…',
    failed: '生成失败，请重试。',
    tip: '手机上长按图片即可保存。',
    save: '保存图片',
    alt: (title) => `分享卡片：${title}`,
    scanToRead: '扫码读全文',
  },

  share: {
    label: '分享到',
    article: '分享这篇文章',
    x: '分享到 X',
    telegram: '分享到 Telegram',
    weibo: '分享到微博',
    threads: '分享到 Threads',
    instagram: '分享到 Instagram',
    wechat: '分享到微信',
    wechatTitle: '微信',
    weiboTitle: '微博',
    copy: '复制链接',
    copied: '已复制',
    copyFailed: '复制失败',
  },

  home: {
    pinned: '置顶',
    latest: '最新',
    readMore: '阅读全文',
    allPosts: '全部文章',
    noPosts: '还没有文章。',
    totalPosts: (count) => `共 ${count} 篇文章`,
    pageTitle: (page) => `第 ${page} 页`,
  },

  aside: {
    label: '最近与这个站',
    now: '最近',
    facts: '这个站',
    shelf: '书架',
  },

  facts: {
    posts: '文章',
    words: '约计字数',
    written: '写了',
    days: '天',
    unit: '篇',
    wordUnit: '字',
    tenThousand: '万',
  },

  shelf: {
    title: '书架',
    books: '书单',
    films: '片单',
    music: '歌单',
    booksLead: '读过、想再读，愿意推荐给别人的那些书。',
    filmsLead: '看过、会重看，愿意推荐给别人的那些电影。',
    musicLead: '反复听过的专辑和歌，愿意推荐给别人的那些。',
    booksHeading: '书',
    filmsHeading: '电影',
    musicHeading: '音乐',
    allLists: '书单 · 片单 · 歌单',
    otherLists: '其他清单',
    wroteAbout: '写过',
    wroteAboutShort: '写过',
    credit: '书与电影的封面取自豆瓣，只作个人记录之用；封面与简介的权利归豆瓣、出版方和发行方所有。',
    empty: '这一栏还没有条目。',
    lead: '读过、看过、反复听过，愿意推荐给别人的那些。',
    categories: '分类',
    indexTitle: '书单 · 片单 · 歌单',
    booksTitle: '书单',
    filmsTitle: '片单',
    musicTitle: '歌单',
    bookHeading: '书',
    filmHeading: '电影',
    musicHeading: '音乐',
    backToFirst: (title) => `回到${title}第一页`,
    pageOf: (page) => `第 ${page} 页`,
    pagedTitle: (title, page) => `${title} · 第 ${page} 页`,
  },

  now: {
    title: '最近',
    pageTitle: '最近与这个站',
    description: '在听、在读、在看，以及这个站的一些数字。',
    lead: '在听、在读、在看，以及这个站写下的那些数字。',
  },

  tags: {
    title: '归档',
    allTags: '全部标签',
    postsWith: (tag) => `标签「${tag}」下的文章`,
    count: (count) => `${count} 篇`,
    empty: '还没有文章。',
    description: '按时间排列的全部文章，以及一份按标签整理的索引。',
    yearsToNow: (year) => `${year} 年至今`,
    year: (year) => `${year} 年`,
    total: (count) => `，共 ${count} 篇。`,
    otherTags: '其他标签',
    taggedTitle: (tag) => `标签：${tag}`,
    taggedDescription: (tag) => `标签「${tag}」下的全部文章。`,
    taggedCount: (count) => `这个标签下有 ${count} 篇文章。`,
  },

  friends: {
    title: '友链',
    description: '一些值得一读的博客和朋友。',
    lead: '一些常去串门的个人博客。排名不分先后，愿大家都能慢慢写下去。',
    missing: '缺少友链内容：src/content/pages/friends.md',
    opensNewWindow: '（在新窗口打开）',
  },

  about: {
    title: '关于',
    description: '关于纸上留白，关于写字，关于一些没有答案的问题。',
  },

  footer: {
    poweredBy: '由 Astro 驱动',
    rss: 'RSS',
  },

  notFound: {
    title: '页面不存在',
    description: '这个地址上没有页面。可能是链接写错了，也可能是文章已经删掉。',
    backHome: '回到首页',
    heading: '这一页留白了。',
    lead: '你要找的页面可能被移走了，也可能从来没有写下来。可以从文章列表或归档重新找起。',
    toPosts: '回到文章列表',
    toArchive: '查看归档',
  },

  zoom: {
    open: '查看大图',
    close: '关闭大图（×）',
    stage: '滚轮缩放，拖动平移，双击切换',
    group: '图片缩放',
    out: '缩小（−）',
    in: '放大（+）',
    reset: '还原到原始大小（1:1）',
    enlarged: (alt) => `放大图片：${alt}`,
    fallbackAlt: '文章图片',
  },

  shelfMore: {
    all: '看全部',
    more: '还有',
    expand: '展开',
    unit: { book: '本', film: '部', music: '张' },
    empty: '这一份清单还是空的。',
    pagination: (heading) => `${heading}的分页`,
  },

  tagIndex: {
    defaultTitle: '按标签',
    separator: '，',
    unit: '篇',
  },

  code: {
    copy: '复制',
    copyLabel: '复制代码',
    copied: '已复制',
    failed: '复制失败',
  },

  skip: {
    toContent: '跳到正文',
  },

  redirect: {
    title: (site) => `跳转到首页 · ${site}`,
    going: '正在回到首页…',
  },
}

export type ZhDictionary = typeof zh
