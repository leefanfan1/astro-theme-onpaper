/**
 * 界面文案的语言层。
 *
 * 主题是纯静态构建的，语言在构建期就定下来：`siteConfig.i18n.defaultLang`
 * 决定 HTML 写的是哪种语言，`t()` 取到的就是那种语言的字符串。页面上没有
 * 语言切换——一份文案只输出一次，不需要运行时脚本，首屏也不会先闪一遍另一种
 * 语言。要换语言，改配置里那一行再重新构建。
 *
 * 文案本体在 zh.ts 和 en.ts 里，两份字典一一对应；en 按 zh 的结构标注类型，
 * 缺一条就编译不过，不会出现「英文页面上掉出一句中文」。
 */
import { siteConfig } from '@/config'
import { en } from './en'
import { zh } from './zh'

export type Lang = 'zh' | 'en'

export const dictionaries = { zh, en }

export const defaultLang: Lang = siteConfig.i18n.defaultLang

/**
 * 取某个语言下的整本字典。`lang` 省略时用配置里的默认语言。
 */
export function dictionary(lang: Lang = defaultLang) {
  return dictionaries[lang]
}

/**
 * 按点号路径取文案：`t('search.hint')`。取到函数就带着参数调用它，
 * 让「N 条搜索结果」这种带数字的句子也能把语序留在各自的字典里。
 */
export function t(path: string, lang?: Lang): string
export function t(path: string, args?: readonly unknown[], lang?: Lang): string
export function t(path: string, a?: unknown, b?: unknown): string {
  const lang = (typeof a === 'string' ? a : typeof b === 'string' ? b : defaultLang) as Lang
  const args = Array.isArray(a) ? a : []
  const dict = dictionaries[lang] ?? dictionaries[defaultLang]
  let value: unknown = dict
  for (const key of path.split('.')) {
    if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[key]
    }
    else {
      throw new Error(`Unknown i18n key "${path}" (${lang})`)
    }
  }
  if (typeof value === 'function') return String(value(...args))
  if (typeof value === 'string') return value
  throw new Error(`i18n key "${path}" is not a string (${lang})`)
}

/** 语言自身的 BCP 47 标签，给 `<html lang>` 用。 */
export const htmlLang = (lang: Lang = defaultLang) => dictionaries[lang].htmlLang

/** og:locale 用的下划线写法。 */
export const ogLocale = (lang: Lang = defaultLang) => dictionaries[lang].ogLocale
