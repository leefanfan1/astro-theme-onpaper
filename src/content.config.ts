import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    pin: z.number().int().min(0).max(99).default(0),
    draft: z.boolean().default(false),
    /**
     * 文章本身的语言。界面语言由 src/i18n/ 决定，这份字段只描述文章用哪种
     * 语言写成——用来给 `<html lang>` 之外的阅读工具（RSS 阅读器、翻译、
     * 未来的语言过滤）一个依据。不写就是站点的默认语言。
     */
    lang: z.enum(['zh', 'en']).default('zh'),
  }),
})

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
  }),
})

// 书单、片单、歌单：每份 Markdown 一份清单，见 src/utils/shelf.ts 的解析规则。
const shelf = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/shelf' }),
  schema: z.object({
    title: z.string().default(''),
  }),
})

export const collections = { posts, pages, shelf }
