---
title: 纸上留白上手指南：命令、配置与发布
description: 从 npm run dev 到 Cloudflare Pages 部署，整理纸上留白的命令、目录、配置和上线前检查。
published: 2026-06-16
updated: 2026-11-07
tags:
  - 示例
  - 建站
  - 写作
pin: 1
---

这是一份面向站点维护者的上手指南。格式写法见[Markdown 语法手册](/posts/markdown-guide/)，渲染效果见[格式示例](/posts/format-showcase/)。

## 环境

需要 Node.js 22.12 或更高版本。

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://127.0.0.1:4321/`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run new 网址` | 新建文章（可带 `title` / `tags` / `pin` / `draft` 参数） |
| `npm run build` | 生成静态站点到 `dist/` |
| `npm run build:clean` | 清理 Astro 内容缓存后构建 |
| `npm run clean` | 只清理 `.astro` / `node_modules/.astro` 缓存 |
| `npm run preview` | 预览生产构建 |
| `npm run shots` | Playwright 截图检查（需要先启动 dev） |
| `npm run og` | 从 `public/og.svg` 重新生成分享图 |
| `npm run music` | 解析并缓存 `::music` 链接 |

### 新建文章

`npm run new` 后面跟的是**文章的网址**，也就是文件名。标题默认由网址生成，日期自动填今天：

```bash
npm run new rain-before-it-stops
```

命令不会提问，跑完就结束。生成 `src/content/posts/rain-before-it-stops.md`：

```md
---
title: Rain Before It Stops
description: ''
published: 2026-11-07
tags:
  - _未分类
pin: 0
---

在这里开始写正文。
```

想一次把标题、标签、置顶和草稿都定好，就用 `key=value` 写在网址后面（不需要 `--`）：

```bash
npm run new rain-before-it-stops title=雨停之前，先别急着走 tags=随笔,城市 pin=1 draft=1
```

| 参数 | 说明 |
| --- | --- |
| `title` | 标题，默认把网址变成可读标题 |
| `tags` | 标签，逗号分隔，中英文逗号都行 |
| `pin` | 置顶权重，默认 0 |
| `draft` | 写 `draft=1` 存为草稿，只在开发环境可见 |

几个要点：

- 网址只用小写英文、数字和连字符，例如 `rain-before-it-stops`
- 中文标题写成 `title=...`，不要把中文直接放在网址位置
- 不写 `tags` 时会填占位标签 `_未分类`。它只用来保持 frontmatter 的列表格式，不会出现在文章页、标签页、搜索或 RSS 里
- 同名文件已存在时会拒绝覆盖，换一个网址再试

不习惯命令行的话，直接在 `src/content/posts/` 新建 `.md` 并手写 frontmatter，效果完全一样：

```yaml
---
title: 文章标题
description: 一句话摘要
published: 2026-11-06
tags:
  - 随笔
  - 城市
pin: 0
draft: false
---
```

正文直接写 Markdown。首页摘要会优先用 frontmatter 的 `description`，没有时自动取正文前 88 个字；列表、搜索和 SEO 都会使用清理后的纯文本。

### 什么时候用 build:clean

普通写作只需要 `npm run build`。如果你改了 `remark` / `rehype` 插件、自定义指令，或者构建出来的卡片还是旧内容，运行：

```bash
npm run build:clean
```

它会清掉 Astro 的内容缓存再构建，避免旧渲染结果被复用。开发服务器同理：改插件后先停掉 dev，运行 `npm run clean`，再重新 `npm run dev`。

## 目录

```text
src/
  config.ts                 站点、导航、配色、字体、功能开关
  content/posts/            文章
  content/pages/about.md    关于页
  components/               界面组件
  layouts/BaseLayout.astro  页面外壳、主题和 SEO
  pages/                    首页、归档、标签、RSS、搜索索引
  plugins/                  Markdown 指令和构建插件
  styles/                   全局样式
  utils/                    文章查询、格式化、音乐解析
functions/api/views.js      可选的 Cloudflare Pages Function
public/                     字体、分享图、示例图片、_headers
```

## 站点配置

所有站点级设置都在 `src/config.ts`：

- `title` / `subtitle` / `description` / `author` / `email`
- `url`：部署后的真实域名，影响 canonical、RSS、sitemap 和 OG
- `nav`：导航顺序和标签
- `socials`：页脚社交链接
- `friends`：友链页条目
- `analytics.googleAnalyticsId`：可选 GA4 ID，留空不加载
- `theme`：默认明暗模式、颜色 token
- `features`：搜索、阅读数、音乐卡片、GitHub 卡片、媒体嵌入、数学、Mermaid 开关

部署前至少检查 `url`、`email`、`socials` 和 `friends`，它们目前是示例值。

## 在文章里插入卡片

所有卡片都是 Markdown 指令，属性写在同一行里：

```md
::music{url="https://open.spotify.com/album/..."}
::github{url="https://github.com/withastro/astro"}
::embed{url="https://www.bilibili.com/video/BV..." title="B 站视频"}
```

| 指令 | 用途 | 最小写法 |
| --- | --- | --- |
| `::music` | 音乐卡片，自动跨平台匹配 | `::music{url="Spotify 链接"}` |
| `::music-card` | 音乐卡片，手动填字段 | `::music-card{title="..." artist="..."}` |
| `::github` | GitHub 仓库卡片 | `::github{repo="owner/name"}` |
| `::embed` | 视频 / 音乐播放器嵌入 | `::embed{url="YouTube / B 站 / Spotify / Vimeo 链接"}` |

完整参数、可选项和注意事项见 [Markdown 语法手册](/posts/markdown-guide/)。

### 音乐卡片

```md
::music{url="https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy"}
```

**推荐从 Spotify 链接开始。** 构建期会 `fetch` Spotify 元数据，解析专辑/歌曲、艺人和类型，再到 Apple Music、网易云、QQ 音乐搜索，按标题、艺人和类型打分，取每个平台的最高分结果合并成卡片；Spotify 作为起点时准确率最高。

新增链接后运行：

```bash
npm run music
```

结果写入 `src/data/music-cache.json`，建议提交。缓存过的链接构建时不会再次请求平台。

匹配不准的冷门版本，用手动写法固定字段：

```md
::music-card{title="城市" artist="张悬" type="album" cover="https://example.com/cover.jpg" spotify="https://open.spotify.com/album/..."}
```

### GitHub 卡片

最省事的方式是直接粘贴仓库网址，构建时会解析出 owner / repo：

```md
::github{url="https://github.com/withastro/astro"}
```

也可以直接写 `repo`：

```md
::github{repo="withastro/astro" description="The web framework for content-driven websites." stars="52k" forks="2.8k" language="TypeScript"}
```

文章加载时请求一次 GitHub 公开 API 补全描述、Star、Fork 和语言；请求失败时保留你写的静态字段，卡片仍然可点。

### 视频与媒体嵌入

```md
::embed{url="https://www.youtube.com/watch?v=..." title="YouTube 视频"}
::embed{url="https://www.bilibili.com/video/BV..." title="B 站视频"}
```

支持 YouTube、B 站、Spotify、Vimeo。iframe 使用 `loading="lazy"`，进入视口后自动加载，但不会自动播放；不支持的链接会降级成普通外链卡片。

## 分享图

修改 `public/og.svg` 后运行：

```bash
npm run og
```

会生成 `public/og.png`（1200×630）。页面默认使用它作为 `og:image` / `twitter:image`。

## 阅读计数（可选）

静态站点本体不依赖服务端。阅读计数使用 `functions/api/views.js` 和 Cloudflare KV：

1. 在 Cloudflare 创建 KV namespace；
2. 在 Pages 项目绑定 `VIEWS_KV`；
3. 重新部署；
4. 给 `/api/views` 的 POST 加 WAF 限流。

KV 的读改写不是原子操作，适合展示型计数，不适合精确统计；需要精确计数时换 Durable Object 或 D1。未绑定 KV 时接口返回 503，文章页会自动隐藏计数，不影响阅读。

## 部署到 Cloudflare Pages

- Build command：`npm run build`
- Build output directory：`dist`
- Node version：22.12+
- 绑定真实域名后检查 HTTPS、canonical、RSS、sitemap 和 `_headers`

`public/_headers` 定义 CSP、HSTS、缓存等响应头；`astro preview` 不会应用它们，只有部署到 Pages 后才会生效。

本地也可以用 Wrangler：

```bash
npm run build
npx wrangler pages deploy dist
```

## 上线前检查

- [ ] 替换 `siteConfig.url`、邮箱、社交链接、友链
- [ ] 更新 `public/og.svg` 里的域名并运行 `npm run og`
- [ ] 把 `wrangler.toml` 的 `name` 改成真实项目名
- [ ] 检查 `_headers` 和 CSP
- [ ] 在域名下检查 canonical、RSS、sitemap
- [ ] 在 iPhone Safari 和 Android Chrome 各看一次
- [ ] 如果开启 GA4，决定是否需要 consent
- [ ] 如果开放投稿，先处理原始 HTML 的 sanitizer