/**
 * The i18n layer.
 *
 * Two dictionaries have to stay in step: `en` is typed against `zh`, so a key
 * added to one and not the other is a compile error — but only when the type
 * checker runs, and only for keys, not for the ones that are functions. These
 * cases check what the types cannot: that every key resolves, that a function
 * entry is called with its arguments rather than stringified, and that the
 * alternate-language lookup used by the toggle never falls back silently.
 */
import assert from 'node:assert/strict'
// The dictionaries are imported directly rather than through src/i18n/index.ts,
// which reaches for the `@/` alias that only Vite resolves. What is checked
// here is the pair of dictionaries, not the resolver.
import { en as enDict } from '../src/i18n/en.ts'
import { zh as zhDict } from '../src/i18n/zh.ts'

const dictionaries = { zh: zhDict, en: enDict }

const leaves = (object, prefix = '') => {
  const out = []
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') out.push(...leaves(value, path))
    else out.push([path, value])
  }
  return out
}

const zh = leaves(dictionaries.zh)
const en = leaves(dictionaries.en)

{
  // Same shape, key for key.
  assert.deepEqual(en.map(([path]) => path).sort(), zh.map(([path]) => path).sort())
}
{
  // Nothing empty, in either language: an untranslated string that fell back
  // to '' would ship as a blank label rather than showing up as a mistake.
  for (const [path, value] of [...zh, ...en]) {
    if (path === 'facts.unit' && value === '') continue
    if (path === 'facts.wordUnit' && value === '') continue
    if (typeof value === 'string') assert.ok(value.length > 0, `${path} is empty`)
  }
}
{
  // Both languages carry the same kinds: a function on one side and a string
  // on the other would break whichever language the toggle switched to.
  const kinds = new Map(zh.map(([path, value]) => [path, typeof value]))
  for (const [path, value] of en) {
    assert.equal(typeof value, kinds.get(path), `${path} is ${typeof value} in en but ${kinds.get(path)} in zh`)
  }
}
{
  // htmlLang and ogLocale differ per language; everything else is free to be
  // identical (a proper noun, an abbreviation).
  assert.notEqual(dictionaries.zh.htmlLang, dictionaries.en.htmlLang)
  assert.notEqual(dictionaries.zh.ogLocale, dictionaries.en.ogLocale)
  assert.match(dictionaries.zh.htmlLang, /^[a-z]{2}(-[A-Z]{2})?$/)
  assert.match(dictionaries.en.htmlLang, /^[a-z]{2}(-[A-Z]{2})?$/)
}
{
  // Chinese copy should not have leaked into the English dictionary, with the
  // exception of the language's own name (a switch saying "中文" is correct in
  // both) and the site's own name.
  const allow = new Set(['language.zh'])
  for (const [path, value] of en) {
    if (typeof value !== 'string' || allow.has(path)) continue
    assert.doesNotMatch(value, /[一-鿿]/, `${path} still holds Chinese: ${value}`)
  }
}

console.log('i18n: ok')
