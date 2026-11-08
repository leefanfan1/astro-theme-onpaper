import { transformSync, minifySync } from 'rolldown/experimental'
import theme from './critical/theme.ts?raw'
import search from './critical/search.ts?raw'
import top from './critical/top.ts?raw'
import mobile from './critical/mobile.ts?raw'
import toc from './critical/toc.ts?raw'

// Compile once on the server. The browser receives independent inline scripts,
// so the controls work as soon as the font gate reveals the finished body.
let compiled
export function criticalRuntime() {
  if (compiled) return compiled
  compiled = Object.entries({ theme, search, top, mobile, toc }).map(([name, source]) => {
    const result = transformSync(name + '.ts', source, { target: 'es2022' })
    if (result.errors.length) throw new Error(JSON.stringify(result.errors))
    const code = result.code.replace(/\bexport\s*\{\s*\};?/g, '')
    if (/^\s*(?:import|export)\b/m.test(code)) throw new Error('Critical controls must not wait for module imports: ' + name)
    const wrapped = '(()=>{if(window.__onpaperControls?.has(' + JSON.stringify(name) + '))return;(window.__onpaperControls??=new Set()).add(' + JSON.stringify(name) + ');' + code + '})()'
    const output = minifySync(name + '.js', wrapped)
    if (output.errors.length) throw new Error(JSON.stringify(output.errors))
    return output.code
  }).join('\n').replace(/<\/script/gi, '<\\/script')
  return compiled
}
