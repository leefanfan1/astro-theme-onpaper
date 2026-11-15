/**
 * 纸上留白 / OnPaper — 站点配置
 *
 * 这个文件是主题的单一配置入口：站点信息、导航、社交链接、
 * 配色、字体、功能开关都在这里。改主题颜色只需要改 `theme`。
 * 友情链接内容在 `src/content/pages/friends.md`单独维护。
 */

export type ThemeMode = 'auto' | 'light' | 'dark'

/**
 * 颜色只描述角色，不描述色相：
 * paper 页面底色 / paperRaised 浮起的面（弹窗、代码块）/ surface 次级底色 /
 * surfaceAlt 再深一级 / ink 正文墨色 / inkSoft 次要文字 / inkFaint 页边注与辅助信息 /
 * line 分隔线 / accent 钢笔蓝，用于链接、当前位置与焦点 / accentStrong 悬停与按下 /
 * accentSoft 浅底强调 / mark 搜索命中与 <mark> 底色 / selection 选区。
 */
export interface ColorTokens {
  paper: string
  paperRaised: string
  surface: string
  surfaceAlt: string
  ink: string
  inkSoft: string
  inkFaint: string
  line: string
  accent: string
  accentStrong: string
  accentSoft: string
  mark: string
  selection: string
}

/**
 * 书单、片单、歌单里的一项。year、note 可省略；url 填写后条目可点击。
 * cover 是封面图：推荐放在 public/ 下写成 '/shelf/xxx.jpg'，也可以是 https 地址
 * （请选国内能访问的图床）。不填时，音乐会沿用音乐卡片缓存里的封面，其余按书名排一张封面。
 */
export interface ShelfItem {
  title: string
  creator: string
  year?: number
  note?: string
  url?: string
  cover?: string
}

export interface SocialLink {
  label: string
  href: string
  external?: boolean
}

export const siteConfig = {
  title: '纸上留白',
  subtitle: '在字与字之间，留一点呼吸。',
  description: '一个关于随笔、音乐与城市夜色的个人博客。把说不清楚的事写下来，给日子留一点空白。',
  author: '李凡凡',
  email: 'hello@onpaper.example',
  // 部署后改成你的域名。sitemap、canonical、RSS 都会使用它。
  url: 'https://onpaper.example.com',
  lang: 'zh-CN',
  locale: 'zh_CN',
  startYear: 2024,
  // 首页每页文章数（不含置顶）
  postsPerPage: 4,
  // 文章详情页是否默认展开目录
  tocOpen: false,

  nav: [
    { label: '文章', href: '/' },
    { label: '归档', href: '/tags/' },
    { label: '关于', href: '/about/' },
    { label: '友链', href: '/friends/' },
  ],

  socials: [
    { label: 'RSS', href: '/rss.xml', external: true },
    { label: 'GitHub', href: 'https://github.com/', external: true },
    { label: 'Email', href: 'mailto:hello@onpaper.example' },
  ] satisfies SocialLink[],

  // 首页右栏的「最近」：在听、在读、在看。以下是示例，换成你自己的；删掉某项它就不显示。
  now: {
    // 最近在听：填一个音乐平台链接。若 src/data/music-cache.json 里有这条链接
    // （文章里用过 ::music 就会有），会带上封面和歌手；否则只显示 title。
    listening: { url: 'https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy', title: '城市' },
    reading: { title: '城南旧事', creator: '林海音' },
    watching: { title: '海街日记', creator: '是枝裕和' },
  },

  // /shelf/ 页面「书单 · 片单 · 歌单」的内容。以下是示例，换成你自己的；
  // 某一类留空数组，那一栏就不显示。
  shelf: {
    books: [
      { title: '城南旧事', creator: '林海音', year: 1960 },
      { title: '我与地坛', creator: '史铁生', year: 1991 },
      { title: '看不见的城市', creator: '伊塔洛·卡尔维诺', year: 1972 },
    ] satisfies ShelfItem[],
    films: [
      { title: '海街日记', creator: '是枝裕和', year: 2015 },
      { title: '一一', creator: '杨德昌', year: 2000 },
      { title: '花样年华', creator: '王家卫', year: 2000 },
    ] satisfies ShelfItem[],
    music: [
      { title: '城市', creator: '张悬', year: 2009, url: 'https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy' },
      { title: '十年自选', creator: '陈粒', url: 'https://open.spotify.com/album/6fbvyqPZVxVPk5DBm4krJf' },
    ] satisfies ShelfItem[],
  },

  // Google Analytics 4，可选。填入 G-XXXXXXXXXX 后才会在构建产物中启用。
  analytics: {
    googleAnalyticsId: '',
  },

  theme: {
    defaultMode: 'auto' as ThemeMode,
    // 白天：冷白纸面上的蓝黑墨水。正文本身就是蓝黑色，强调色是钢笔蓝。
    light: {
      paper: '#F4F5F7',
      paperRaised: '#FFFFFF',
      surface: '#EAECF0',
      surfaceAlt: '#DFE2E8',
      ink: '#182134',
      inkSoft: '#4A5368',
      inkFaint: '#626B7E',
      line: '#D9DCE3',
      accent: '#2A47C9',
      accentStrong: '#1C318F',
      accentSoft: '#E1E6F8',
      mark: '#DCE3FB',
      selection: 'rgba(42, 71, 201, 0.18)',
    } satisfies ColorTokens,
    // 夜里：深蓝墨底，不用中性纯黑；强调色提亮为灯下的蓝。
    dark: {
      paper: '#10141C',
      paperRaised: '#171C27',
      surface: '#1C2230',
      surfaceAlt: '#252C3C',
      ink: '#E3E6ED',
      inkSoft: '#AAB1C1',
      inkFaint: '#8B93A6',
      line: 'rgba(227, 230, 237, 0.12)',
      accent: '#93A6FF',
      accentStrong: '#BAC6FF',
      accentSoft: 'rgba(147, 166, 255, 0.13)',
      mark: 'rgba(147, 166, 255, 0.24)',
      selection: 'rgba(147, 166, 255, 0.28)',
    } satisfies ColorTokens,
  },

  fonts: {
    // 构建时向 Google Fonts 中国接口请求按页裁剪的字体，字体文件由 fonts.gstatic.cn 托管。
    // display：站名、标题、引文和数字。拉丁字母与数字用 Newsreader，中文用 Noto Serif SC 的粗字重。
    // body：正文、导航与界面文字，统一用 Noto Sans SC（自带拉丁字形，中英文同一套笔画）。
    // 代码、数学和图表保留各自专用字体。
    display: '"Newsreader", "Noto Serif SC", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif',
    body: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
    mono: '"SFMono-Regular", "Cascadia Code", Consolas, "Liberation Mono", monospace',
  },

  features: {
    search: true,
    views: true,
    musicCards: true,
    githubCards: true,
    mediaEmbeds: true,
    math: true,
    mermaid: true,
  },
}

export type SiteConfig = typeof siteConfig
