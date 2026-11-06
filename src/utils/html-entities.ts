/** Common HTML entities used in Chinese blog prose. */
export const htmlEntities: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': '\'',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&middot;': '·',
  '&times;': '×',
  '&divide;': '÷',
  '&plusmn;': '±',
  '&deg;': '°',
  '&laquo;': '«',
  '&raquo;': '»',
  '&bull;': '•',
  '&sect;': '§',
  '&para;': '¶',
  '&euro;': '€',
  '&pound;': '£',
  '&yen;': '¥',
  '&rarr;': '→',
  '&larr;': '←',
  '&harr;': '↔',
  '&dagger;': '†',
  '&Dagger;': '‡',
}

const ENTITY_PATTERN = /&[a-z][a-z0-9]+;|&#\d+;|&#x[\da-f]+;/gi

/**
 * Decode common named/numeric HTML entities.
 * Unknown named entities are removed so raw `&something;` never reaches the page.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY_PATTERN, (entity) => {
    const named = htmlEntities[entity] ?? htmlEntities[entity.toLowerCase()]
    if (named) return named
    if (entity.startsWith('&#')) {
      const hex = entity[2].toLowerCase() === 'x'
      const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10)
      if (Number.isInteger(code) && code >= 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)) {
        return String.fromCodePoint(code)
      }
    }
    return ' '
  })
}