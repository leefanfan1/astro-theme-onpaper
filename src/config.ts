/**
 * 余白 / Yohaku — 站点配置
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
  title: '余白',
  titleEn: 'Yohaku',
  subtitle: '在字与字之间，留一点呼吸。',
  description: '一个关于随笔、音乐与城市夜色的个人博客。把说不清楚的事写下来，给日子留一点余白。',
  author: '林间',
  email: 'hello@yohaku.example',
  // 部署后改成你的域名。sitemap、canonical、RSS 都会使用它。
  url: 'https://yohaku.example.com',
  lang: 'zh-CN',
  locale: 'zh_CN',
  startYear: 2024,
  // 右栏刊头显示的卷号
  volume: '01',
  // 首页每页文章数（不含置顶）
  postsPerPage: 4,
  // 文章详情页是否默认展开目录
  tocOpen: false,

  nav: [
    { label: '文章', href: '/' },
    { label: '归档', href: '/tags/' },
    { label: '关于', href: '/about/' },
  ],

  socials: [
    { label: 'RSS', href: '/rss.xml', external: true },
    { label: 'GitHub', href: 'https://github.com/', external: true },
    { label: 'Email', href: 'mailto:hello@yohaku.example' },
  ] satisfies SocialLink[],

  theme: {
    defaultMode: 'auto' as ThemeMode,
    light: {
      paper: '#FAF9F5',
      paperRaised: '#FFFFFF',
      surface: '#F0EEE6',
      surfaceAlt: '#E8E6DC',
      ink: '#141413',
      inkSoft: '#5E5D59',
      inkFaint: '#87867F',
      line: '#E5E3DA',
      accent: '#D97757',
      accentStrong: '#C46849',
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
    // 拉丁标题使用自托管的 Newsreader；中文标题使用自托管的 Noto Serif SC Variable。
    display: '"Newsreader", "Noto Serif SC Variable", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif',
    body: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", system-ui, sans-serif',
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