import fs from 'node:fs'

// Astro can keep rendered Markdown in its content cache. Clear it when a
// remark/rehype plugin changes, otherwise the card markup may stay stale.
for (const dir of ['.astro', 'node_modules/.astro']) {
  fs.rmSync(dir, { recursive: true, force: true })
}
console.log('cleared Astro content/build caches')