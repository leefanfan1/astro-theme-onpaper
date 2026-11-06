#!/usr/bin/env node
/**
 * Create a new post.
 *
 *   npm run new a-walk-without-a-map
 *   npm run new a-walk-without-a-map title=在一条不认识的街上走一会儿
 *   npm run new my-post title=标题 tags=随笔,城市 pin=1 draft=1
 *
 * The first argument is the URL path / file name. Extra options are written as
 * key=value, which npm forwards as-is (it treats --flags as its own config).
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const POSTS_DIR = path.resolve(process.cwd(), 'src/content/posts')
const PLACEHOLDER_TAG = '_未分类'

const argv = process.argv.slice(2)
const options = new Map()
let slugArg = ''

for (const arg of argv) {
  const eq = arg.indexOf('=')
  if (eq > 0) {
    options.set(arg.slice(0, eq).trim().toLowerCase(), arg.slice(eq + 1))
  }
  else if (!slugArg) {
    slugArg = arg.trim()
  }
}

function pad(n) {
  return String(n).padStart(2, '0')
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

function humanize(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function yamlScalar(value) {
  const text = String(value).trim()
  if (!text) return "''"
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(text)) return `"${text}"`
  if (/^[\w一-龥][\w一-龥 .,!?'()/-]*$/.test(text)) return text
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

if (!slugArg) {
  console.error('')
  console.error('用法: npm run new 文章网址 [选项]')
  console.error('')
  console.error('  npm run new a-walk-without-a-map')
  console.error('  npm run new a-walk-without-a-map title=在一条不认识的街上走一会儿')
  console.error('  npm run new my-post title=标题 tags=随笔,城市 pin=1 draft=1')
  console.error('')
  console.error('  选项（都可省略，用 key=value 写在网址后面）:')
  console.error('    title   标题，默认用网址生成')
  console.error('    tags    标签，逗号分隔；不写会填一个不显示的分类标签')
  console.error('    pin     置顶权重，默认 0')
  console.error('    draft   写 draft=1 存为草稿，只在开发环境可见')
  console.error('')
  process.exit(1)
}

if (!/^[a-z0-9-]+$/i.test(slugArg)) {
  console.error(`「${slugArg}」不是合法的网址。`)
  console.error('网址只用小写英文和连字符，例如: npm run new my-new-post')
  console.error('中文标题写成 title=你的标题。')
  process.exit(1)
}

const slug = slugify(slugArg)
const target = path.join(POSTS_DIR, `${slug}.md`)

if (fs.existsSync(target)) {
  console.error(`已存在 src/content/posts/${slug}.md，换一个网址再试。`)
  process.exit(1)
}

const now = new Date()
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

const title = (options.get('title') ?? '').trim() || humanize(slug)
const tags = (options.get('tags') ?? '')
  .split(/[,，]/)
  .map(t => t.trim())
  .filter(Boolean)

// Always emit the block style. With no tags, keep one placeholder so the file
// still reads the same way; the site filters out tags starting with "_".
const effectiveTags = tags.length ? tags : [PLACEHOLDER_TAG]

const pin = Number.parseInt(options.get('pin') ?? '0', 10)
const draft = /^(1|true|yes)$/i.test(String(options.get('draft') ?? ''))

const frontmatter = [
  '---',
  `title: ${yamlScalar(title)}`,
  "description: ''",
  `published: ${today}`,
  'tags:',
  ...effectiveTags.map(tag => `  - ${yamlScalar(tag)}`),
  `pin: ${Number.isFinite(pin) ? pin : 0}`,
  ...(draft ? ['draft: true'] : []),
  '---',
  '',
  '在这里开始写正文。',
  '',
].join('\n')

fs.mkdirSync(POSTS_DIR, { recursive: true })
fs.writeFileSync(target, frontmatter, 'utf-8')

console.log('')
console.log(`  已创建 src/content/posts/${slug}.md`)
console.log(`  网址 /posts/${slug}/`)
if (!tags.length) console.log(`  标签留了占位 ${PLACEHOLDER_TAG}，不会显示在站点上。`)
console.log('')
console.log('  接下来：')
console.log('    · 补上 description（列表、搜索、分享都会用到）')
console.log('    · 把「在这里开始写正文。」换成正文')
console.log('    · npm run dev 预览')
console.log('')
