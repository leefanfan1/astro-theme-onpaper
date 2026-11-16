import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

/**
 * The inline runtime a packet carries is the part already running in the
 * reader's document: the font loader, the critical runtime, the theme script
 * and the route manifest. Re-sending them costs ~54 KB of every packet for
 * nothing, because the client only needs the *markup* of the incoming page —
 * the navigator installs those scripts once and keeps them.
 *
 * So a packet is the page with those scripts emptied. Anything with a `src` is
 * a module the router loads itself, so it stays; only inline non-JSON scripts
 * are dropped, and the manifest is left out entirely.
 */
function slimDocument(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (whole, attrs, body) => {
    // Modules with a src are loaded by the router on arrival; keep them.
    if (/src\s*=/.test(attrs)) return whole
    // The manifest is added per document by the writer, not carried in packets.
    if (/application\/json/.test(attrs)) return ''
    // Everything else is the inline runtime, already running in the client.
    if (!body.trim()) return whole
    return ''
  })
}

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
    records.push({ ...record, slim: slimDocument(html) })
  }
  const prefix = '/_navigation/' + version.digest('hex').slice(0, 20) + '/'
  const routes = Object.fromEntries(records.map(record => [record.url, prefix + record.file]))
  const manifest = '<script type="application/json" data-onpaper-navigation>'
    + JSON.stringify(routes).replaceAll('<', '\\u003c') + '</script>'
  for (const record of records) {
    const html = record.html.replace('</head>', manifest + '</head>')
    const path = join(output, prefix, record.file)
    await mkdir(dirname(path), { recursive: true })
    // The packet carries the page with its inline runtime stripped: the
    // client already runs those scripts and only needs the markup.
    await writeFile(path, JSON.stringify({ url: record.url, html: record.slim }))
    await writeFile(record.path, html)
  }
  return records.length
}
