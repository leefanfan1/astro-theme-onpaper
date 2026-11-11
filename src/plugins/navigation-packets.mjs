import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

// Cache route documents separately from independently reusable hosted fonts.
export async function writeNavigationPackets(output, paths) {
  const records = []
  const version = createHash('sha256')
  for (const path of [...paths].sort()) {
    const html = await readFile(path, 'utf8')
    if (!html.includes('astro-view-transitions-enabled')) continue
    const file = relative(output, path).replaceAll('\\', '/')
    const url = '/' + file.replace(/index\.html$/, '')
    const record = { path, file: file.replace(/\.html$/, '.json'), url, html }
    version.update(JSON.stringify([url, html]))
    records.push(record)
  }
  const prefix = '/_navigation/' + version.digest('hex').slice(0, 20) + '/'
  const routes = Object.fromEntries(records.map(record => [record.url, prefix + record.file]))
  const manifest = '<script type="application/json" data-onpaper-navigation>'
    + JSON.stringify(routes).replaceAll('<', '\\u003c') + '</script>'
  for (const record of records) {
    const html = record.html.replace('</head>', manifest + '</head>')
    const path = join(output, prefix, record.file)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ url: record.url, html }))
    await writeFile(record.path, html)
  }
  return records.length
}
