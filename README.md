<div align="center">

# 纸上留白 · OnPaper

**在字与字之间，留一点呼吸。**

[![License](https://img.shields.io/badge/LICENSE-MIT-2f363d?style=for-the-badge)](LICENSE) [![Astro](https://img.shields.io/badge/ASTRO-7.x-BC52EE?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build) [![Node](https://img.shields.io/badge/NODE-%E2%89%A522.12-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org) [![Cloudflare Pages](https://img.shields.io/badge/CLOUDFLARE-PAGES-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)

**[预览](#预览) · [特性](#特性) · [快速开始](#快速开始) · [部署](#部署到-cloudflare-pages) · [设计说明](#设计说明)**

</div>

---

## 预览

![纸上留白界面预览：浅色首页、深色首页、文章页、归档页与移动端](docs/showcase.png)

---

## 特性

| | |
| :--- | :--- |
| **✦ 排版优先**<br>中文正文使用自托管 Noto Serif SC，英文标题使用 Newsreader；代码、数学与图表各用专用字体。 | **◐ 阅读体验**<br>文章目录、阅读进度、图片灯箱（滚轮 / 双指缩放、拖动）、回到顶部与分享栏。 |
| **▯ 移动端**<br>文章页顶栏随滚动压缩，给正文让出空间；44px 触控热区。 | **◯ 搜索**<br><kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd> 唤起，构建期索引覆盖标题、标签与正文。 |
| **◑ 主题**<br>浅色 / 深色 / 跟随系统，圆形揭示切换，可持久化。 | **✎ Markdown 扩展**<br>KaTeX 公式、Mermaid 图表、音乐卡片、GitHub 卡片与视频嵌入。 |
| **◎ 可选能力**<br>Google Analytics 4，以及基于 Cloudflare KV 的阅读计数。 | **⌘ 无障碍**<br>跳转正文、可见焦点、语义化标题、`aria-current`、可键盘操作的弹窗。 |

---

## 快速开始

需要 Node.js **22.12** 或更高版本。

```bash
npm install
npm run dev
```

打开 <http://127.0.0.1:4321/>。

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run new 网址` | 新建文章（可带 `title` / `tags` / `pin` / `draft` 参数） |
| `npm run build` | 生成静态站点到 `dist/` |
| `npm run test:font-email` | 构建并验证弱网字体加载与邮箱链接（需安装 Playwright Chromium、WebKit） |
| `npm run build:clean` | 清理 Astro 内容缓存后再构建 |
| `npm run clean` | 只清理 `.astro` / `node_modules/.astro` 缓存 |
| `npm run preview` | 预览生产构建 |
| `npm run shots` | Playwright 截图检查（需要先运行 dev） |
| `npm run og` | 从 `public/og.svg` 重新生成 `public/og.png` |
| `npm run music` | 解析并缓存 `::music` 指令里的链接 |

### 新建文章

`npm run new` 后面跟的是**文章的网址**，也就是文件名。标题默认由网址生成，日期自动填今天：

```bash
npm run new a-walk-without-a-map
```

生成 `src/content/posts/a-walk-without-a-map.md`：

```md
---
title: A Walk Without a Map
description: ''
published: 2026-11-07
tags:
  - _未分类
pin: 0
---

在这里开始写正文。
```

命令不会提问，跑完就结束；标题不合适，打开文件改 `title` 即可。

想一次把标题、标签、置顶和草稿都定好，就用 `key=value` 写在网址后面（不需要 `--`，也不用记位置）：

```bash
npm run new a-walk-without-a-map title=在一条不认识的街上走一会儿 tags=随笔,城市 pin=1 draft=1
```

| 参数 | 说明 |
| --- | --- |
| `title` | 标题，默认把网址变成可读标题 |
| `tags` | 标签，逗号分隔，中英文逗号都行 |
| `pin` | 置顶权重，默认 0 |
| `draft` | 写 `draft=1` 存为草稿，只在开发环境可见 |

几个要点：

- 网址只用小写英文、数字和连字符，例如 `a-walk-without-a-map`
- 中文标题写成 `title=...`，不要把中文直接放在网址位置
- 不写 `tags` 时，脚本会填一个占位标签 `_未分类`。它只用来保持 frontmatter 的列表格式，不会出现在文章页、标签页、搜索或 RSS 里
- 同名文件已存在时会拒绝覆盖，换一个网址再试

标签沿用列表写法（`tags:` 下面每个一行），和现有文章一致。

不想用命令也完全可以：直接新建 `src/content/posts/我的文章.md`，手动写 frontmatter，效果一样。

---

## 项目结构

```text
src/
├── config.ts                 站点、导航、配色、字体、功能开关
├── content.config.ts         内容集合 schema
├── content/
│   ├── posts/                文章
│   └── pages/                about.md 关于页、friends.md 友链页
├── components/               界面组件
├── layouts/BaseLayout.astro  页面外壳、主题脚本、全局样式
├── pages/                    首页、文章、归档、标签、关于、搜索索引、RSS
├── plugins/                  Markdown 指令、Mermaid、外链、开发期 views
├── styles/                   字体、布局、正文、扩展卡片
└── utils/                    文章查询、格式化、音乐解析

functions/api/views.js        Cloudflare Pages Function
scripts/                      音乐缓存、OG 生成、截图、缓存清理
public/                       favicon、OG、字体、示例图片、_headers
```

---

## 站点配置

站点信息、导航和主题设置集中在 `src/config.ts`；友情链接内容在 `src/content/pages/friends.md` 中单独维护：

<details>
<summary><b>展开完整配置示例</b></summary>

```ts
export const siteConfig = {
  title: '纸上留白',
  subtitle: '在字与字之间，留一点呼吸。',
  description: '一个关于随笔、音乐与城市夜色的个人博客。',
  author: '李凡凡',
  email: 'hello@onpaper.example',
  url: 'https://onpaper.example.com', // 部署后改成真实域名
  postsPerPage: 4,
  tocOpen: false, // 文章目录默认收起

  nav: [
    { label: '文章', href: '/' },
    { label: '归档', href: '/tags/' },
    { label: '关于', href: '/about/' },
    { label: '友链', href: '/friends/' },
  ],

  analytics: {
    googleAnalyticsId: '', // 可选，填写 GA4 的 G-XXXXXXXXXX
  },

  socials: [
    { label: 'RSS', href: '/rss.xml', external: true },
    { label: 'GitHub', href: 'https://github.com/', external: true },
    { label: 'Email', href: 'mailto:hello@onpaper.example' },
  ],

  theme: {
    defaultMode: 'auto', // auto | light | dark
    light: { paper: '#FAF9F5', ink: '#141413', accent: '#D97757' },
    dark: { paper: '#141413', ink: '#FAF9F5', accent: '#D97757' },
  },

  fonts: {
    display: '"Newsreader", "Noto Serif SC Variable", "Songti SC", …',
    body: '"Newsreader", "Noto Serif SC Variable", "Songti SC", …',
    mono: '"SFMono-Regular", Consolas, …',
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
```

</details>

### 改配色

只改 `theme.light` / `theme.dark` 即可，主题会把它们注入成 CSS 变量：

| 变量 | 用途 | 变量 | 用途 |
| --- | --- | --- | --- |
| `paper` | 页面背景 | `ink` | 主文字 |
| `paperRaised` | 卡片 / 代码块表面 | `inkSoft` | 正文 / 次要文字 |
| `surface` | 浅一层的表面 | `inkFaint` | 日期 / 说明文字 |
| `surfaceAlt` | 更深的表面 | `line` | 分隔线 |
| `accent` | 链接、当前导航 | `accentStrong` | 强调文字的深色版 |
| `accentSoft` | 强调的浅底 | `peach` | 辅助暖色 |
| `moss` | 辅助橄榄绿 | | |

默认配色：`#FAF9F5` 纸色、`#141413` 墨色、`#D97757` 赤陶橙、`#788C5D` 橄榄绿。

### 改字体

`siteConfig.fonts` 控制三套字体栈：

- 中文：自托管 **Noto Serif SC Variable**，按 `unicode-range` 分片，浏览器只加载实际用到的字形
- 英文：自托管 **Newsreader**（SIL OFL）
- 代码：等宽字体；数学与 Mermaid 使用各自的专用字体

页面文字首次显示前会准备好本页所需的站点字体，避免首屏使用系统字体或中文分片混用。关键字体加载逻辑直接内联在页面中，不依赖额外模块下载；站内换页先准备下一页的字体，等待时保留当前页面。字体使用同源文件、预加载和浏览器缓存；首次访问且网络较慢时，文字显示前仍需等待下载。临时请求失败会在后台持续自动重试（间隔逐步增加，最长 30 秒），网络恢复时也会重新检查，不显示失败提示或重试按钮。请勿将字体改为 `font-display: optional`，该策略可能让整次访问都停留在系统字体。禁用 JavaScript 时保留浏览器原生字体加载与邮件链接。

### 友链

所有友情链接集中写在 `src/content/pages/friends.md`，每个友链依次写名称、网址、简介三行，友链之间空一行：

```text
朋友的博客
https://example.com/
一段简短的介绍。

另一位朋友
https://example.org/
另一段介绍。
```

复制一组三行即可新增友链，删除对应组即可移除，调整上下顺序即可改变展示顺序。无需括号、列表符号或缩进；网址填写完整地址，简介可以省略，也可以写多行。文件顶部的 `title` 和 `description` 分别设置页面标题和搜索摘要。页面会自动将这些内容显示为友链卡片，线上修改后需要重新构建部署。

### 分享图（OG）

`public/og.svg` 是分享卡片模板，`npm run og` 会把它渲染成 `public/og.png`（1200×630）。页面默认用它作为 `og:image` / `twitter:image`。

修改标题、副标题或配色后，先同步 `public/og.svg`，再运行：

```bash
npm run og
```

### Google Analytics 4（可选）

1. 在 [Google Analytics](https://analytics.google.com) 创建媒体资源和 Web 数据流，复制 Measurement ID（`G-XXXXXXXXXX`）
2. 填到 `siteConfig.analytics.googleAnalyticsId`
3. 重新构建并部署

只有生产构建且 ID 非空时才注入 `gtag.js`，`npm run dev` 不会加载。主题关闭了 GA 的自动 page_view，改为在 `astro:page-load` 手动上报，客户端路由切换也能正确统计。留空则完全不加载任何 GA 脚本。

---

## 写文章

推荐用 `npm run new` 生成（见上方「新建文章」），标题、标签和置顶可以一次写清：

```bash
npm run new rain-before-it-stops title=雨停之前，先别急着走 tags=随笔,城市
```

生成后打开 `src/content/posts/rain-before-it-stops.md`，补上 `description` 和正文即可。

也可以直接在 `src/content/posts/` 新建 `.md`，文件名即网址：

```md
---
title: 雨停之前，先别急着走
description: 一句话摘要，会出现在列表和搜索里。
published: 2026-10-28
updated: 2026-10-30        # 可选
tags:
  - 随笔
  - 城市
pin: 1                     # 0 为不置顶，数字越大越靠前
draft: false               # true 时只在 dev 可见
---

正文……
```

关于页在 `src/content/pages/about.md`。首页每页文章数由 `siteConfig.postsPerPage` 控制；置顶文章只出现在第一页，列表里用一个小别针图标标记。

---

## Markdown 扩展

### 音乐卡片

```md
::music{url="https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy"}
```

构建时：

1. 先读 `src/data/music-cache.json` 缓存
2. 没有缓存时，用 `fetch` 读取 Spotify 元数据
3. 解析专辑 / 单曲名、艺人、类型与封面
4. 到 Apple Music / 网易云 / QQ 音乐搜索，按标题、艺人、类型打分
5. 每个平台取最高分且达到阈值的结果，合并成一张卡片

> [!TIP]
> **推荐从 Spotify 链接开始**，作为起点时跨平台匹配准确率最高。想加音乐，先在 Spotify 找到专辑或歌曲，再粘贴 `::music` 链接。

新增或修改链接后运行 `npm run music`，结果会写回 `src/data/music-cache.json`，建议一起提交，之后构建不再请求平台。

手动填写（需要自己准备封面）：

```md
::music-card{title="城市" artist="张悬" cover="https://.../cover.jpg" type="album" spotify="https://open.spotify.com/album/..."}
```

### GitHub 卡片

支持直接粘贴仓库网址，或写 `owner/name`：

```md
::github{url="https://github.com/withastro/astro"}

::github{repo="withastro/astro" description="The web framework for content-driven websites." stars="52k" forks="2.8k" language="TypeScript"}
```

`url` 形式会在构建时解析出 owner / repo。卡片在浏览器里按需读取 GitHub 公开 API，并用 `sessionStorage` 缓存；没有网络时保留静态字段。

### 媒体嵌入

```md
::embed{url="https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy" title="张悬《城市》" caption="有时候，一张专辑就够陪一个晚上。"}
```

支持 YouTube、Bilibili、Spotify、Vimeo。iframe 使用 `loading="lazy"`，进入视口后自动加载，**不会自动播放**（B 站额外设置 `autoplay=0`、`poster=1` 并禁用 autoplay 权限）。

### 数学与图表

行内数学 `$T = \frac{C}{400}$`，块级数学：

```md
$$
\text{留白} = \text{内容} - \text{噪音}
$$
```

Mermaid：

````md
```mermaid
flowchart LR
  A[Markdown] --> B[Astro]
  B --> C[静态 HTML]
```
````

Mermaid 只在页面出现图表时动态加载；KaTeX 的 CSS 也只在文章包含数学时引入。

> [!NOTE]
> 修改 Markdown 插件后，先停止开发服务，运行 `npm run clean`，再重新 `npm run dev`，避免 Astro 继续使用旧的内容缓存。

---

## 部署到 Cloudflare Pages

页面输出包含 Cloudflare 的 `email_off` 排除标记，邮箱地址和 `mailto:` 链接直接保留在 HTML 中，避免 Email Address Obfuscation 将地址改写为依赖解码脚本的 `[email protected]`。页脚与关于页在脚本未加载时也可使用邮箱链接。

站点是纯静态的，只有阅读计数通过一个 Pages Function 访问 KV。

在 Cloudflare Pages 里设置：

| 配置项 | 值 |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22.12+ |

或者本地构建后用 Wrangler 上传：

```bash
npm run build
npx wrangler pages deploy dist
```

### 绑定 KV（可选，用于阅读计数）

1. 进入 **Workers & Pages → KV**，创建命名空间，例如 `onpaper-views`
2. 进入 Pages 项目 → **Settings → Functions → KV namespace bindings**
3. 变量名填 **`VIEWS_KV`**，选择刚创建的命名空间
4. 重新部署

也可以使用 Wrangler：

```bash
npx wrangler kv namespace create VIEWS_KV
```

把返回的 id 填进 `wrangler.toml` 里被注释掉的 `[[kv_namespaces]]` 块并取消注释。

接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/views?slug=post-id` | 返回 `{ "views": 12 }` |
| `POST` | `/api/views?slug=post-id` | 计数 +1，返回新值 |

slug 只接受小写字母、数字和连字符，最长 96 字符。KV 未绑定时返回 503，文章页会自动隐藏计数，不影响阅读。

`npm run dev` 使用内存里的同名接口做演示，重启后计数归零。

---

## 设计说明

- **布局**：正文列 + 右侧固定窄栏（刊头、导航、搜索、主题、页脚）；移动端折叠为顶部导航和单列列表
- **刊头**：只保留大号「纸上留白」和副标题，去掉卷号与英文小字
- **首页**：文章列表 + 分页，不做营销式 hero；列表标题、描述和分隔线与内容列同宽
- **文章页**：宽屏桌面左侧固定层级目录，窄屏回退顶部目录面板；宽屏标题左侧固定「← 返回」，较窄宽度放在标题上方
- **归档**：按年份分组的纵向时间线 + 标签索引
- **颜色**：平涂背景，没有渐变和装饰光效
- **动效**：页面过渡、滚动渐入、主题圆形揭示；优先使用透明度与 transform，全部尊重 `prefers-reduced-motion`
- **图标**：全部为内联 SVG 或 CSS 形状

---

## 灵感

版式上受到这两个 Astro 主题的启发，推荐一并看看：

- [astro-theme-retypeset](https://github.com/radishzzz/astro-theme-retypeset)
- [astro-theme-typography](https://github.com/moeyua/astro-theme-typography)

---

## 许可

[MIT](LICENSE) · 字体 Newsreader 与 Noto Serif SC 使用 SIL Open Font License 1.1，见 `public/fonts/` 下的授权文件。

*纸上留白 · 在字与字之间，留一点呼吸。*
