import postcss from 'postcss'

export const FONT_ORIGIN = 'https://fonts.gstatic.cn'
const CSS_ORIGIN = 'https://fonts.googleapis.cn'
const families = new Set(['Newsreader', 'Noto Serif SC'])
const allowed = new Set(['font-family', 'font-style', 'font-weight', 'font-display', 'font-stretch', 'src', 'unicode-range'])

export function fontURL(value) {
  if (typeof value !== 'string') throw new Error('Invalid hosted font URL')
  const url = new URL(value)
  if (url.origin !== FONT_ORIGIN || url.username || url.password || url.hash
    || !(url.pathname === '/l/font' || /^\/s\/.+\.woff2$/.test(url.pathname))) throw new Error('Unexpected hosted font source')
  return url.href
}

export function validateDefinitions(input, family) {
  if (!Array.isArray(input) || !input.length || input.length > 256) throw new Error('Invalid hosted font definitions')
  return input.map(face => {
    if (!face || typeof face !== 'object' || !families.has(face.family ?? family)
      || (family && face.family && face.family !== family)) throw new Error('Unexpected hosted font family')
    if (!['normal', 'italic'].includes(face.style)) throw new Error('Invalid hosted font style')
    if (typeof face.weight !== 'string' || !/^\d{1,4}(?:\s+\d{1,4})?$/.test(face.weight)) throw new Error('Invalid hosted font weight')
    const weights = face.weight.split(/\s+/).map(Number)
    if (weights.some(n => n < 1 || n > 1000) || weights.length === 2 && weights[0] > weights[1]) throw new Error('Invalid hosted font weight range')
    let range
    if (face.range !== undefined) {
      if (typeof face.range !== 'string') throw new Error('Invalid hosted font unicode range')
      for (const part of face.range.split(',')) {
        const token = part.trim()
        if (!/^U\+(?:[\da-f]{1,6}(?:-[\da-f]{1,6})?|[\da-f]{0,5}\?{1,6})$/i.test(token)) throw new Error('Invalid hosted font unicode range')
        const [start, end = start] = token.slice(2).split('-')
        const a = parseInt(start.replaceAll('?', '0'), 16), b = parseInt(end.replaceAll('?', 'f'), 16)
        if (start.length > 6 || a > b || b > 0x10ffff) throw new Error('Invalid hosted font unicode interval')
      }
      range = face.range
    }
    return { family: face.family ?? family, url: fontURL(face.url), style: face.style, weight: weights.join(' '), ...(range ? { range } : {}) }
  })
}

// Third-party CSS is data, never markup. Accept only font descriptors and
// serialize them ourselves; use this on cached data as well as network input.
export function parseHostedCSS(css, family) {
  if (typeof css !== 'string' || Buffer.byteLength(css) > 262144) throw new Error('Invalid hosted font CSS size')
  const definitions = []
  for (const rule of postcss.parse(css).nodes) {
    if (rule.type === 'comment') continue
    if (rule.type !== 'atrule' || rule.name !== 'font-face' || rule.params || !rule.nodes) throw new Error('Unexpected hosted CSS rule')
    const props = {}
    for (const node of rule.nodes) {
      if (node.type === 'comment') continue
      if (node.type !== 'decl' || !allowed.has(node.prop) || node.important || Object.hasOwn(props, node.prop)) throw new Error('Unexpected hosted font descriptor')
      props[node.prop] = node.value
    }
    const name = props['font-family']?.replace(/^(['"])(.*)\1$/, '$2')
    const match = props.src?.match(/^url\(\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^'"\s)]+))\s*\)\s+format\(['"]woff2['"]\)$/)
    if (!families.has(name) || !match || props['font-stretch'] && props['font-stretch'] !== 'normal') throw new Error('Unexpected hosted font source descriptor')
    definitions.push({ family: name, url: match[1] ?? match[2] ?? match[3], style: props['font-style'], weight: props['font-weight'], ...(props['unicode-range'] ? { range: props['unicode-range'] } : {}) })
  }
  return validateDefinitions(definitions, family)
}

export function serializeHostedCSS(definitions) {
  return validateDefinitions(definitions).map(face => '@font-face{font-family:"' + face.family + '";src:url("' + face.url + '") format("woff2");font-style:' + face.style + ';font-weight:' + face.weight + ';font-display:block' + (face.range ? ';unicode-range:' + face.range : '') + '}').join('')
}

export async function fetchHostedBytes(value, kind, headers) {
  const url = new URL(kind === 'font' ? fontURL(value) : value)
  if (kind !== 'font' && (url.origin !== CSS_ORIGIN || url.pathname !== '/css2' || url.username || url.password || url.hash)) throw new Error('Unexpected hosted CSS endpoint')
  const response = await fetch(url.href, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('Hosted font request failed: ' + response.status)
  const limit = kind === 'font' ? 8 * 1024 * 1024 : 262144
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Hosted font response too large') }
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      size += chunk.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('Hosted font response too large') }
      chunks.push(Buffer.from(chunk))
    }
  } finally { reader.releaseLock() }
  const bytes = Buffer.concat(chunks, size)
  if (kind === 'font' && bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error('Expected a WOFF2 font response')
  return bytes
}
