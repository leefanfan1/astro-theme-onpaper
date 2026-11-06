#!/usr/bin/env node
/**
 * Create a new post.
 *
 *   npm run new -- a-walk-without-a-map
 *
 * The argument is the URL path / file name. The title defaults to a readable
 * version of that path ("a-walk-without-a-map" → "A Walk Without a Map"), then
 * the script asks a few quick questions so you don't have to remember flags.
 *
 * Everything is optional — press Enter to accept the default.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'

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

const now = new Date()
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`

const input = positional.join(' ').trim()
if (!input && !flags.get('slug')) {
  console.error('')
  console.error('用法: npm run new -- 文章网址')
  console.error('')
  console.error('  例如: npm run new -- a-walk-without-a-map')
  console.error('')
  console.error('  参数就是文章的网址和文件名，用英文和连字符写。')
  console.error('  运行后脚本会问标题、标签，回车即可跳过。')
  console.error('')
  process.exit(1)
}

// Positional argument is the slug. A CJK string is treated as the title and
// gets a timestamp slug, because it cannot be used in a URL as-is.
const looksLikeTitle = input && !/^[a-z0-9-]+$/i.test(input)
const presetSlug = typeof flags.get('slug') === 'string' ? slugify(flags.get('slug')) : ''
const slug = presetSlug || (looksLikeTitle ? '' : slugify(input))
const finalSlug = slug || `post-${stamp}`

if (!finalSlug) {
  console.error('无法生成网址，请用一个英文短名，例如: npm run new -- my-new-post')
  process.exit(1)
}

const target = path.join(POSTS_DIR, `${finalSlug}.md`)
if (fs.existsSync(target)) {
  console.error(`已存在 src/content/posts/${finalSlug}.md，换一个网址再试。`)
  process.exit(1)
}

const canPrompt = Boolean(process.stdin.isTTY) && !flags.get('yes') && !flags.get('no-input')
const rl = canPrompt ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null

function ask(question, fallback) {
  if (!rl) return Promise.resolve(fallback)
  return rl.question(`${question}${fallback ? `（回车使用「${fallback}」）` : ''}: `).then(answer => answer.trim() || fallback)
}

console.log('')
console.log(`  新建文章  /posts/${finalSlug}/`)
console.log('  ' + '─'.repeat(38))
console.log('')

const defaultTitle = looksLikeTitle ? input : humanize(finalSlug)
const title = typeof flags.get('title') === 'string' ? flags.get('title') : await ask('标题', defaultTitle)

const tagsInput = typeof flags.get('tags') === 'string'
  ? flags.get('tags')
  : await ask('标签（逗号分隔，可留空）', '')
const tags = tagsInput ? tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean) : []

const pinInput = flags.has('pin') ? String(flags.get('pin')) : await ask('置顶权重（0 = 不置顶）', '0')
const pin = Number.parseInt(pinInput, 10)

const draftInput = flags.has('draft')
  ? 'y'
  : await ask('存为草稿？只有开发环境可见 (y/N)', 'n')
const draft = /^y/i.test(draftInput)

rl?.close()

// Match the block style used by the existing posts:
//   tags:
//     - 随笔
// An empty list has to stay inline, otherwise YAML parses it as null.
const tagBlock = tags.length
  ? ['tags:', ...tags.map(tag => `  - ${yamlScalar(tag)}`)]
  : ['tags: []']

const frontmatter = [
  '---',
  `title: ${yamlScalar(title)}`,
  "description: ''",
  `published: ${today}`,
  ...tagBlock,
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
console.log(`  已创建 src/content/posts/${finalSlug}.md`)
console.log(`  网址 /posts/${finalSlug}/`)
console.log('')
console.log('  接下来：')
console.log(`    1. 打开 src/content/posts/${finalSlug}.md`)
console.log('    2. 补上 description（会显示在列表、搜索和分享里）')
console.log('    3. 把「在这里开始写正文。」换成正文')
console.log('    4. 运行 npm run dev 预览')
console.log('')
console.log('  标签写法（和已有文章保持一致）：')
console.log('    tags:')
console.log('      - 随笔')
console.log('      - 城市')
console.log('')
if (!tags.length) console.log('  提示：这次没填标签，文件里写成了 tags: []（YAML 空列表的标准写法）。')
console.log('')
if (!looksLikeTitle && !presetSlug && !slug) {
  console.log('  提示：网址用的是时间戳，想换成更好记的名字可以重命名文件。')
}
if (draft) console.log('  提示：draft: true 只会在 npm run dev 里看到。')
