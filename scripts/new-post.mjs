#!/usr/bin/env node
/**
 * Scaffold a new post with frontmatter.
 *
 *   npm run new -- "在一条不认识的街上走一会儿"
 *   npm run new -- "标题" --slug a-walk-without-a-map --tags 随笔,城市 --pin 1
 *   npm run new -- "草稿" --draft
 *
 * Chinese titles produce an empty ASCII slug, so pass --slug when the title is
 * not Latin. Without one, the file falls back to post-YYYYMMDD-HHmm.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const POSTS_DIR = path.resolve(process.cwd(), 'src/content/posts')

const argv = process.argv.slice(2)
const flags = new Map()
const positional = []

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg.startsWith('--')) {
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      flags.set(key, next)
      i++
    }
    else {
      flags.set(key, true)
    }
  }
  else {
    positional.push(arg)
  }
}

const title = (positional.join(' ') || flags.get('title') || '').trim()
if (!title) {
  console.error('用法: npm run new -- "文章标题" [--slug my-slug] [--tags 随笔,城市] [--pin 1] [--draft]')
  process.exit(1)
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

const now = new Date()
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
const customSlug = typeof flags.get('slug') === 'string' ? slugify(flags.get('slug')) : ''
const slugFromTitle = slugify(title)
const slug = customSlug || slugFromTitle || `post-${stamp}`

if (!slug) {
  console.error('无法从标题生成 slug，请用 --slug 指定一个英文短名。')
  process.exit(1)
}

const tags = typeof flags.get('tags') === 'string'
  ? flags.get('tags').split(',').map(t => t.trim()).filter(Boolean)
  : []
const pin = Number.parseInt(String(flags.get('pin') ?? '0'), 10)
const draft = flags.get('draft') === true || flags.get('draft') === 'true'
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

// YAML-safe scalar: quote value when punctuation could change its meaning.
function yamlScalar(value) {
  const text = String(value)
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(text)) return `"${text}"`
  if (/^[\w一-龥][\w一-龥 .,!?'()/-]*$/.test(text)) return text
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const frontmatter = [
  '---',
  `title: ${yamlScalar(title)}`,
  "description: ''",
  `published: ${date}`,
  tags.length ? 'tags:' : 'tags: []',
  ...tags.map(tag => `  - ${yamlScalar(tag)}`),
  `pin: ${Number.isFinite(pin) ? pin : 0}`,
  ...(draft ? ['draft: true'] : []),
  '---',
  '',
  '在这里开始写正文。',
  '',
].join('\n')

fs.mkdirSync(POSTS_DIR, { recursive: true })
const target = path.join(POSTS_DIR, `${slug}.md`)

if (fs.existsSync(target)) {
  console.error(`已存在同名文章: src/content/posts/${slug}.md`)
  console.error('换一个 --slug，或直接编辑已有文件。')
  process.exit(1)
}

fs.writeFileSync(target, frontmatter, 'utf-8')

console.log(`已创建 src/content/posts/${slug}.md`)
console.log(`URL: /posts/${slug}/`)
if (!customSlug && !slugFromTitle) {
  console.log('提示：标题不是拉丁字符，已用时间戳作为 slug；可用 --slug 自定义。')
}
if (draft) console.log('提示：draft: true 只会在开发环境可见。')
console.log('下一步：npm run dev，然后打开文章页检查排版。')
