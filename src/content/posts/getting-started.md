---
title: 纸上留白上手指南：命令、配置与发布
description: 从 npm run dev 到 Cloudflare Pages 部署，整理纸上留白的命令、目录、配置和上线前检查。
published: 2026-06-16
updated: 2026-11-16
tags:
  - 示例
  - 建站
  - 写作
pin: 1
---

这是一份面向站点维护者的上手指南。格式写法见[Markdown 语法手册](/posts/markdown-guide/)，渲染效果见[格式示例](/posts/format-showcase/)。

## 环境

需要 Node.js 22.23.4 或更高版本（Astro 7 的最低要求）。仓库里的 `.node-version` 写的也是这个版本，Cloudflare Pages 会读它。

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
| `npm run covers` | 去豆瓣补书单 / 片单的封面 |
| `npm run shots` | Playwright 截图检查（需要先启动 dev） |
| `npm run og` | 从 `public/og.svg` 重新生成分享图 |
| `npm run music` | 解析并缓存 `::music` 链接 |

测试都要先构建，命令本身会跑 `npm run build`：

| 命令 | 验证什么 |
| --- | --- |
| `npm run test:responsiveness` | 脚本延迟下关键控件仍可用、后台预取让路、连续换页取消、翻页遮罩 |
| `npm run test:performance` | 首屏字体体积、无模块等待、无布局跳动、搜索恢复 |
| `npm run test:hosted-fonts` | 在线字体来源、动态字形、跨页复用、Chrome / WebKit 一致性 |
| `npm run test:font-source` | 字体源安全边界、斜体与显示字体文字收集（不访问 CDN） |
| `npm run test:theme-controls` | 主题动画、控件对齐、切换中搜索、换页清理 |


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
  config.ts             站点、导航、配色、字体、开关
  content.config.ts     posts / pages / shelf 的 schema
  content/posts/        文章
  content/pages/        about、friends、now
  content/shelf/        books、films、music
  components/           书脊、右栏、书架卡片、目录
  layouts/              页面外壳、翻页、主题
  pages/                首页、归档、书架、404、RSS
  plugins/              指令、Mermaid、外链、消毒
  styles/               base、prose、extensions
  utils/                内联运行时、文章、书架
functions/api/views.js  可选的阅读计数
public/                 字体、分享图、封面、_headers
tests/                  五套回归测试
```

## 站点配置

所有站点级设置都在 `src/config.ts`：

- `title` / `subtitle` / `description` / `author` / `email`
- `url`：部署后的真实域名，影响 canonical、RSS、sitemap 和 OG
- `nav`：导航顺序和标签
- `socials`：页脚社交链接
- `analytics.googleAnalyticsId`：可选 GA4 ID，留空不加载
- `theme`：默认明暗模式、颜色 token
- `fonts`：正文 / 显示 / 等宽三套字体栈
- `features`：搜索、阅读数、音乐卡片、GitHub 卡片、媒体嵌入、数学、Mermaid 开关

部署前至少检查 `url`、`email`、`socials`，它们目前是示例值。

右栏「最近」和书单不在这里，各自是 Markdown，见下面两节。

### 管理友情链接

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

### 右栏「最近」

`src/content/pages/now.md` 管着首页右栏的三行。每段两行：第一行是标签和名称，第二行是作者 / 歌手，末尾可以跟一个网址——在读、在看填豆瓣条目页，在听填音乐平台。

```text
在听：《城市》
张悬 https://open.spotify.com/album/2X2WYTQl5BVInM0StQChCy
```

删掉某一段，那一行就不显示。「这个站」里的篇数、字数和天数由文章自动统计，不用维护。

桌面端右栏就在文章列表旁边；手机上它是收起来的，顶栏最右边那个按钮进 `/now/`。那是同一份内容做成的一个独立页面，有自己的网址和返回按钮，不是弹出的抽屉。两边共用 `src/components/SiteAside.astro`，改一处就都变了。

### 书单、片单、歌单

三份 Markdown，一份清单一个文件：

- `src/content/shelf/books.md`
- `src/content/shelf/films.md`
- `src/content/shelf/music.md`

每本 / 每部 / 每张写成一个段落，一行一个字段：

```text
书名：城南旧事
作者：林海音
年份：1960
豆瓣：https://book.douban.com/subject/3057333/
一句话：小时候读不懂，长大才知道它写的是告别。
```

书单用 `书名：` / `作者：`，片单用 `片名：` / `导演：`，歌单用 `名称：` / `歌手：` / `链接：`。名称必填，其余可省；`一句话：` 显示在封面下面；文件开头的 `<!-- -->` 注释不会出现在页面上。

页面有两个层次：

- `/shelf/` 三栏合在一起的海报墙，每栏右上角有「看全部」
- `/shelf/books/`、`/shelf/films/`、`/shelf/music/` 各自单独一页，可以直接分享

点封面去豆瓣（歌单回到音乐平台）。如果条目标题在某一篇文章里出现过，卡片下面会多一行「写过：…」，跳到那篇文章；文章里有对应小标题的话，直接跳到那一段。某一栏超过 12 项时折进一个 `<details>`，不依赖脚本；要改这个数量，改 `src/pages/shelf.astro` 里的 `VISIBLE`。单独页 `/shelf/books/` 每页 25 项，第 2 页起走 `/shelf/books/page/2/`，数量在 `src/utils/shelf-covers.ts` 的 `SHELF_PER_PAGE`。

封面从豆瓣来，但不在页面里直接引用豆瓣的图床——它有防盗链，浏览器直接请求会返回 418。所以运行：

```bash
npm run covers
```

脚本读上面三份 Markdown，给没写 `封面：` 的条目去豆瓣找图：写了 `豆瓣：` 就用那个条目页，没写就按标题搜。封面下载到 `public/shelf/`，路径记进 `src/data/shelf-covers.json`，下载时压到 800px，一张 50–110KB。歌单的封面同样存到本地（500px 的方图）。只补某几本可以 `node scripts/fetch-covers.mjs 城南旧事 一一`。

图片放在自己的站上，也就意味着不依赖豆瓣的可用性。新加条目后跑一次 `npm run covers`，`public/shelf/` 和那份 JSON 一起提交。
删条目也是同一条命令：从书单 / 片单 / 歌单里删掉一段，再跑一次 `npm run covers`，那一张封面会在 `public/shelf/` 和 `src/data/shelf-covers.json` 里同时消失。你自己放进目录的图（文件名不是脚本生成的 12 位十六进制）不会被动；三份 Markdown 只要有一份读不到，这一轮就不删，免得目录被清空。

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

页面默认用 `public/og.png`（1200×630）作为 `og:image` / `twitter:image`。改 `public/og.svg` 之后重新生成：

```bash
npm run og
```

文章不一样：每篇在构建时生成自己的 `/og/<slug>.png`，左边竖排站名，右边日期、标题和摘要前 60 个字。字体只按图里用到的字取子集，缓存在 `node_modules/.cache/onpaper-og/`，所以加文章不用重新跑 `npm run og`。

文章页末尾的「分享卡片」还会画一张带二维码的图，扫码打开当前文章。二维码在浏览器里本地生成（`uqr`），不请求任何外部服务。

## 阅读计数（可选）

静态站点本体不依赖服务端。阅读计数使用 `functions/api/views.js` 和 Cloudflare KV：

1. 在 Cloudflare 创建 KV namespace；
2. 在 Pages 项目绑定 `VIEWS_KV`；
3. 重新部署；
4. 给 `/api/views` 的 POST 加 WAF 限流。

KV 的读改写不是原子操作，适合展示型计数，不适合精确统计；需要精确计数时换 Durable Object 或 D1。未绑定 KV 时接口返回 503，文章页会自动隐藏计数，不影响阅读。

`npm run dev` 用内存里的同名接口演示，重启后计数归零。

## 部署到 Cloudflare Pages

- Build command：`npm run build`
- Build output directory：`dist`
- Node version：22.23.4+（`.node-version` 已写好）

`public/_headers` 定义 CSP、HSTS、缓存等响应头；`astro preview` 不会应用它们，只有部署到 Pages 后才会生效。

本地也可以用 Wrangler：

```bash
npm run build
npx wrangler pages deploy dist
```

## 安全

主题默认允许在文章里写原始 HTML，所以构建时会过一次 `rehype-sanitize`。schema 在 `src/plugins/rehype-sanitize-markdown.mjs`，是这套主题自己的词汇表：卡片的 class、脚本要读的 `data-*`、SVG 的 `viewBox` / `path`，还有 KaTeX 的 MathML。`<script>` 和 `on*` 事件属性都会丢掉；iframe 只认四个白名单域名（YouTube、B 站、Spotify、Vimeo）。

行内的 `style` 可以用，比如 `<span style="color:red">红</span>` 或 `<div style="text-align:center">`——CSS 没有别的写法能表达这些。但不是照单全收：只有 `color`、`font-weight`、`text-align` 这类字号排版的属性会保留，值也要匹配该属性的形状；`url()`、`expression()`、`position` 之类的声明会被单独丢掉，不影响同一行里其余的声明。完整名单在同一个文件的 `CSS_VALUES` 里。

插件链的完整顺序在 `src/plugins/markdown-pipeline.mjs`，`astro.config.mjs` 只是把它交给 Astro。要点是：清洗只管作者写的那部分 HTML，KaTeX、Mermaid、代码高亮、脚注这些主题自己生成的标记排在它之后，不会被再过滤一遍——否则彩色文字、代码高亮的配色、公式排版都会在不声不响中丢掉样式。`rehypeSlug` 排在最后，因为消毒会给每个 `id` 加 `user-content-` 前缀，标题锚点必须在那之后才生成，指向某一小节的链接才能找到目标。

**这套消毒真正的意义在换作者的时候。** 只写自己的博客时，能写 HTML 的就是你自己；但主题会被别人拿去用，作者不一定可信。

## 上线前检查

- [ ] 替换 `siteConfig.url`（**最要紧的一项**）、邮箱、社交链接
- [ ] 换掉 `src/content/pages/friends.md` 里的示例友链
- [ ] 换掉 `src/content/pages/now.md` 和 `src/content/shelf/` 下的示例
- [ ] 更新 `public/og.svg` 里的域名并运行 `npm run og`
- [ ] 把 `wrangler.toml` 的 `name` 改成真实项目名
- [ ] 检查 `_headers` 和 CSP
- [ ] 在域名下检查 canonical、RSS、sitemap 和 404
- [ ] 在 iPhone Safari 和 Android Chrome 各看一次
- [ ] 如果开启 GA4，决定是否需要 consent
- [ ] 如果开放投稿，确认消毒 schema 覆盖了你需要的标记
