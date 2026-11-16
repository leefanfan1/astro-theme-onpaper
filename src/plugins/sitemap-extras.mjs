/**
 * Two additions to @astrojs/sitemap.
 *
 * - lastmod for articles, from each post's `updated` (or `published`) date,
 *   so search engines know which pages changed.
 * - /sitemap.xml as a copy of /sitemap-index.xml: the conventional address
 *   that people and many tools try first. robots.txt still names the index.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const POSTS = fileURLToPath(new URL('../content/posts/', import.meta.url))

function* markdown(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* markdown(path)
    else if (entry.name.endsWith('.md')) yield path
  }
}

// The id Astro's glob loader gives an entry without a `slug` field (a
// github-slugger slug of each path part). An unusual file name that this
// approximation gets wrong only loses its lastmod.
const slug = part => part.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
const idOf = path => relative(POSTS, path).replace(/\.md$/, '').split(/[\\/]/).map(slug).join('/')

const field = (frontmatter, name) => {
  const match = frontmatter.match(new RegExp(`^${name}:\\s*['"]?([^'"\\n#]+?)['"]?\\s*(?:#.*)?$`, 'm'))
  if (!match) return null
  // A bare date (even 2026-5-11) is a calendar day, read as UTC like the
  // dates printed on the site.
  const day = match[1].match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const date = day ? new Date(Date.UTC(+day[1], +day[2] - 1, +day[3])) : new Date(match[1])
  return Number.isNaN(date.getTime()) ? null : date
}

/** Map of article path (/posts/<id>/) to its last modified date. */
export function postModifiedDates() {
  const dates = new Map()
  try {
    for (const path of markdown(POSTS)) {
      const frontmatter = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
      if (!frontmatter || /^draft:\s*true\s*$/m.test(frontmatter)) continue
      if (/^slug:/m.test(frontmatter)) continue
      const date = field(frontmatter, 'updated') ?? field(frontmatter, 'published')
      if (date) dates.set(`/posts/${idOf(path)}/`, date)
    }
  }
  catch {}
  return dates
}

/** Options for sitemap(): fills in lastmod where an article date is known. */
export function sitemapOptions() {
  const dates = postModifiedDates()
  return {
    // /page/1/ redirects to the home page; it has nothing of its own to index.
    filter: page => !/\/page\/1\/?$/.test(new URL(page).pathname),
    serialize(item) {
      const date = dates.get(new URL(item.url).pathname)
      return date ? { ...item, lastmod: date.toISOString() } : item
    },
  }
}

/** Integration: write /sitemap.xml after the sitemap is generated. */
export function sitemapAlias() {
  return {
    name: 'onpaper-sitemap-alias',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        try {
          await copyFile(new URL('sitemap-index.xml', dir), new URL('sitemap.xml', dir))
          logger.info('`sitemap.xml` written as a copy of `sitemap-index.xml`')
        }
        catch (error) {
          logger.warn(`sitemap.xml was not written: ${error.message}`)
        }
      },
    },
  }
}
