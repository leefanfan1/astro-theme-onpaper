/**
 * 纸上留白 / OnPaper — 站点配置
 *
 * 这个文件是主题的单一配置入口：站点信息、导航、社交链接、
 * 配色、字体、功能开关都在这里。改主题颜色只需要改 `theme`。
 */

export type ThemeMode = 'auto' | 'light' | 'dark'

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
  peach: string
  moss: string
  selection: string
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

  // 友链示例。开源前替换成你自己的朋友。
  friends: [
    {
      name: '山茶书房',
      url: 'https://shanchafang.example/',
      description: '读书、电影，和一些不着急的日常。',
    },
    {
      name: '夜航日志',
      url: 'https://nightlog.example/',
      description: '在夜里写字的人，记录城市和耳机。',
    },
    {
      name: '缓慢更新',
      url: 'https://slowletter.example/',
      description: '不追热点，只写自己真正想读的东西。',
    },
    {
      name: '纸间',
      url: 'https://paperbetween.example/',
      description: '排版、纸张、字体，以及一点点旧书气。',
    },
    {
      name: '苔庭',
      url: 'https://mossgarden.example/',
      description: '植物、散步和慢慢长出来的生活。',
    },
    {
      name: '余白',
      url: 'https://onpaper.example/',
      description: '余白不是空，是让内容有地方站直。',
    },
  ],

  // Google Analytics 4，可选。填入 G-XXXXXXXXXX 后才会在构建产物中启用。
  analytics: {
    googleAnalyticsId: '',
  },

  theme: {
    defaultMode: 'auto' as ThemeMode,
    light: {
      paper: '#FAF9F5',
      paperRaised: '#FFFFFF',
      surface: '#F0EEE6',
      surfaceAlt: '#E8E6DC',
      ink: '#141413',
      inkSoft: '#5E5D59',
      inkFaint: '#6F6D65',
      line: '#E5E3DA',
      accent: '#D97757',
      accentStrong: '#A94E33',
      accentSoft: '#F7E8E2',
      peach: '#EBC9B7',
      moss: '#788C5D',
      selection: 'rgba(217, 119, 87, 0.22)',
    } satisfies ColorTokens,
    dark: {
      paper: '#141413',
      paperRaised: '#1E1D1B',
      surface: '#232220',
      surfaceAlt: '#2C2A27',
      ink: '#FAF9F5',
      inkSoft: '#B8B5AB',
      inkFaint: '#8D8A80',
      line: 'rgba(250, 249, 245, 0.12)',
      accent: '#D97757',
      accentStrong: '#E08B6D',
      accentSoft: 'rgba(217, 119, 87, 0.15)',
      peach: '#5A3A2E',
      moss: '#9AAE7C',
      selection: 'rgba(217, 119, 87, 0.30)',
    } satisfies ColorTokens,
  },

  fonts: {
    // 中文统一使用自托管的 Noto Serif SC Variable；英文使用 Newsreader。
    // 代码、数学和图表保留各自专用字体。
    display: '"Newsreader", "Noto Serif SC Variable", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif',
    body: '"Newsreader", "Noto Serif SC Variable", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif',
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