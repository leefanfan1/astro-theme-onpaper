import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run after npm run build. Serve production HTML and CSP on local HTTP.
// WebKit upgrades loopback resources too, so omit only the HTTPS-upgrade
// directive on this HTTP fixture; deployed production headers stay untouched.
const dist = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const headers = await readFile(resolve(dist, '_headers'), 'utf8')
const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1].replace(/; upgrade-insecure-requests/, '')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let path = resolve(dist, '.' + pathname)
    if (path !== dist && !path.startsWith(dist + sep)) { response.writeHead(403).end(); return }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html')
    const data = await readFile(path)
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', ...(csp ? { 'Content-Security-Policy': csp } : {}) })
    response.end(data)
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = 'http://127.0.0.1:' + server.address().port

const errors = []
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch()
    try {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme:'light', reducedMotion:'no-preference', deviceScaleFactor: 2 })
        const page = await context.newPage()
        page.on('pageerror',error=>errors.push(error.message))
        await page.goto(base + '/')
        await page.waitForFunction(()=>document.documentElement.dataset.fontState==='ready')
        const host = width > 1100 ? '.rail-actions' : '.mobile-bar__actions'
        const button = host + ' [data-theme-toggle]'
        await page.evaluate(() => {
          window.__themeAnimations=[]
        window.__themeNavigationProbe = true
          const original = Element.prototype.animate
          Element.prototype.animate=function(frames, options) {
            const motion=original.call(this,frames,options)
            if(options?.pseudoElement?.includes('root')) window.__themeAnimations.push(motion)
            return motion
          }
        })
        for (const theme of ['light', 'dark']) {
          if(theme==='dark') {
            await page.locator(button).click()
            if(engine===chromium && await page.evaluate(()=>Boolean(document.startViewTransition))) {
              await page.waitForFunction(()=>window.__themeAnimations.length>0)
              const frame=await page.evaluate(()=> {
                const motion = window.__themeAnimations.at(-1)
                motion.pause()
                motion.currentTime = 80
                return {state:document.documentElement.dataset.theme, keyframes:motion.effect.getKeyframes(), pointer:getComputedStyle(document.documentElement,'::view-transition').pointerEvents, duration:motion.effect.getTiming().duration}
              })
              assert.equal(frame.state,'dark')
              assert.equal(frame.pointer,'none')
              assert.equal(frame.duration,480)
              assert.match(frame.keyframes[0].clipPath, /^circle\(0px at /)
              assert.notEqual(frame.keyframes[0].clipPath, frame.keyframes.at(-1).clipPath)
              await page.evaluate(()=>window.__themeAnimations.at(-1).finish())
            }
            if(engine===webkit) {
              const colors=await page.evaluate(()=>({theme:document.documentElement.dataset.theme, animations:document.body.getAnimations().map(m=>m.transitionProperty)}))
              assert.equal(colors.theme,'dark')
              assert.ok(colors.animations.includes('background-color'),JSON.stringify(colors))
            }
            await page.waitForFunction(()=>!document.documentElement.classList.contains('theme-changing')&&!document.documentElement.classList.contains('theme-color-changing'))
          }
          const visual = await page.evaluate(host => {
            function inkCenter(svg) {
              let y=0, total=0
              for(const shape of svg.children) {
                if(!shape.getTotalLength)continue
                const len=shape.getTotalLength()
                for (let i = 0; i < 400; i++) {
                  y += shape.getPointAtLength(len * (i + 0.5) / 400).y * len / 400
                  total += len / 400
                }
              }
              const r=svg.getBoundingClientRect()
              return r.top + y/total/24*r.height
            }
            const search=document.querySelector(host+' .text-button__icon')
            const theme=[...document.querySelectorAll(host+' .theme-toggle svg')].find(e=>e.getBoundingClientRect().height>0)
            const label=document.querySelector(host+' .text-button__label')
            let labelInk
            if(label) {
              const style=getComputedStyle(label), canvas=document.createElement('canvas').getContext('2d')
              canvas.font=style.font
              const m=canvas.measureText(label.textContent), r=label.getBoundingClientRect()
              const baseline=r.top+(r.height-m.fontBoundingBoxAscent-m.fontBoundingBoxDescent)/2+m.fontBoundingBoxAscent
              labelInk=baseline+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2
            }
            return { search: inkCenter(search), theme: inkCenter(theme), label: labelInk }
          },host)
          assert.ok(Math.abs(visual.search-visual.theme)<0.5,JSON.stringify(visual))
          if(visual.label) assert.ok(Math.abs(visual.label-visual.search)<0.7,JSON.stringify(visual))
        }
        await page.locator(button).click({clickCount:3,delay:30})
        await page.waitForFunction(()=>document.documentElement.dataset.theme==='light'&&!document.documentElement.classList.contains('theme-changing'))
        assert.equal(await page.evaluate(()=>localStorage.getItem('onpaper-theme')),'light')
        await page.locator(button).click()
        await page.locator(host+' [data-search-trigger]').click()
        assert.equal(await page.locator('dialog[open]').count(),1)
        await page.keyboard.press('Escape')
        await page.waitForFunction(()=>!document.documentElement.classList.contains('theme-changing'))
        await page.locator(button).click()
        await page.evaluate(()=>document.querySelector('a[href="/about/"]').click())
        await page.waitForURL('**/about/')
        await page.waitForFunction(()=>document.documentElement.dataset.fontState==='ready'&&!document.documentElement.classList.contains('theme-changing'))
        assert.equal(await page.evaluate(() => window.__themeNavigationProbe), true)
        await page.evaluate(() => history.back())
        await page.waitForURL(base + '/')
        await page.waitForFunction(() => document.documentElement.dataset.fontState === 'ready')
        assert.equal(await page.evaluate(() => window.__themeNavigationProbe), true)
        await page.reload()
        await page.waitForFunction(()=>document.documentElement.dataset.fontState==='ready')
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light')
        await context.close()
        console.log('PASS '+engine.name()+' '+width+': optical alignment, '+(engine===webkit?'live color transition':'circular reveal')+', rapid toggles, search during switching, navigation cleanup and persistence')
      }
      for(const mode of ['reduce','unsupported']) {
        const context=await browser.newContext({reducedMotion:mode==='reduce'?'reduce':'no-preference',colorScheme:'light'})
        const page=await context.newPage()
        page.on('pageerror',error=>errors.push(error.message))
        if(mode==='unsupported')await page.addInitScript(()=>{document.startViewTransition=undefined})
        await page.goto(base+'/')
        await page.waitForFunction(()=>document.documentElement.dataset.fontState==='ready')
        await page.locator('.rail-actions [data-theme-toggle]').click()
        await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark')
        assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('theme-changing')),false)
        if(mode==='reduce') assert.equal(await page.evaluate(()=>document.body.getAnimations().length),0)
        await context.close()
        console.log('PASS '+engine.name()+': '+mode+' fallback')
      }
    } finally { await browser.close() }
  }
  assert.deepEqual(errors,[])
} finally {
  server.close()
}
