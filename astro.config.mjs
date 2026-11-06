import { unified } from '@astrojs/markdown-remark'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import remarkDirective from 'remark-directive'
import remarkMath from 'remark-math'
import { siteConfig } from './src/config.ts'
import { devViewsIntegration } from './src/plugins/dev-views.mjs'
import { rehypeExternalLinks } from './src/plugins/rehype-external-links.mjs'
import { rehypeMermaid } from './src/plugins/rehype-mermaid.mjs'
import { rehypeStripEntities } from './src/plugins/rehype-strip-entities.mjs'
import { remarkEditorialExtensions } from './src/plugins/remark-editorial-extensions.mjs'

export default defineConfig({
  site: siteConfig.url,
  trailingSlash: 'always',
  // Cloudflare Pages serves the static `dist/` folder. Pages Functions under
  // `functions/` provide the optional KV-backed view counter.
  output: 'static',
  server: {
    host: '127.0.0.1',
    port: 4321,
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  integrations: [sitemap(), devViewsIntegration()],
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkDirective,
        remarkMath,
        remarkEditorialExtensions,
      ],
      rehypePlugins: [
        rehypeSlug,
        rehypeKatex,
        rehypeMermaid,
        rehypeExternalLinks,
        rehypeStripEntities,
      ],
    }),
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
  vite: {
    build: {
      // Mermaid is a large lazily-loaded chunk; it is only fetched on pages with diagrams.
      chunkSizeWarningLimit: 2000,
    },
  },
  devToolbar: {
    enabled: false,
  },
})