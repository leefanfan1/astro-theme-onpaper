import { unified } from '@astrojs/markdown-remark'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { siteConfig } from './src/config.ts'
import { hostedFontIntegration } from './src/plugins/hosted-page-fonts.mjs'
import { devViewsIntegration } from './src/plugins/dev-views.mjs'
import { remarkPlugins, rehypePlugins } from './src/plugins/markdown-pipeline.mjs'
import { sitemapAlias, sitemapOptions } from './src/plugins/sitemap-extras.mjs'

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
  integrations: [sitemap(sitemapOptions()), sitemapAlias(), devViewsIntegration(), hostedFontIntegration(siteConfig.fonts)],
  markdown: {
    processor: unified({ remarkPlugins, rehypePlugins }),
    shikiConfig: {
      themes: {
        light: 'github-light-high-contrast',
        dark: 'github-dark-high-contrast',
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
