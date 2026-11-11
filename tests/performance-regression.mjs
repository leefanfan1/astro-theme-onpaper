import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,stat,mkdir} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium,webkit} from 'playwright'
// Run after npm run build. Serve production HTML and CSP on local HTTP.
// WebKit upgrades loopback resources too, so omit only the HTTPS-upgrade
// directive on this HTTP fixture; deployed production headers stay untouched.
const dist = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
await mkdir(new URL('../_analysis/', import.meta.url), { recursive: true })
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

const errors=[]
try {
for (const engine of [chromium,webkit]) {
const browser=await engine.launch()
try {
for(const width of [390,1440]) {
const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference',colorScheme:'light'})
const page=await context.newPage()
page.setDefaultTimeout(45000)
page.on('pageerror',e=>errors.push(e.message))
await page.addInitScript(()=>{
  Object.defineProperty(navigator,'connection',{value:{saveData:true,effectiveType:'3g'}})
  window.__readyAt=0; window.__shifts=[]
  document.addEventListener('onpaper:fonts-ready',()=>{window.__readyAt ||= performance.now()})
  try {new PerformanceObserver(list=>{for(const e of list.getEntries())if(window.__readyAt&&e.startTime>window.__readyAt&&!e.hadRecentInput)window.__shifts.push(e.value)}).observe({type:'layout-shift',buffered:true})}catch{}
})
let release
const gate=new Promise(resolve=>{release=resolve})
await context.route('**/*.js',async route=>{await gate;await route.continue()})
try {
  await page.goto(base+'/',{waitUntil:'commit'})
  await page.waitForFunction(()=>document.documentElement.dataset.fontState==='ready')
  assert.equal(await page.evaluate(()=>document.readyState==='complete'),false,'font readiness must not wait for page modules')
  const fonts=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).origin==='https://fonts.gstatic.cn').map(e=>({url:e.name,size:e.transferSize})))
  assert.equal(fonts.length,3,'the first page must load the three hosted text subsets')
  assert.ok(fonts.reduce((n,f)=>n+f.size,0)<600000,JSON.stringify(fonts))
  assert.equal(fonts.some(f=>f.url.includes('/_astro/noto-serif')),false,'the first page must use small original-font subsets')
  const before=await page.locator('.site-main').boundingBox()
  release()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  const after=await page.locator('.site-main').boundingBox()
  assert.ok(Math.abs(after.y-before.y)<0.5,JSON.stringify({before,after}))
  assert.deepEqual(await page.evaluate(()=>window.__shifts),[])
  let releaseIndex
  const indexGate=new Promise(resolve=>{releaseIndex=resolve})
  let requested=0
  await context.route('**/search.json',async route=>{requested++;await indexGate;await route.continue()})
  await page.locator(width>1100?'.rail-actions [data-search-trigger]':'.mobile-bar [data-search-trigger]').click()
  assert.equal(requested,1,'opening search should start its index before typing')
  const input=page.locator('#search-input')
  await input.fill('Markdown')
  await page.waitForTimeout(180)
  await input.fill('')
  await page.waitForTimeout(180)
  releaseIndex()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.search-result').count(),0)
  await input.fill('Markdown')
  await page.locator('.search-result').first().waitFor().catch(async error=>{console.error(await page.evaluate(()=>({query:document.querySelector('#search-input')?.value,status:document.querySelector('[data-search-status]')?.textContent,fonts:[...document.fonts].filter(f=>f.status==='loading'||f.status==='error').map(f=>({family:f.family,status:f.status,range:f.unicodeRange}))})));throw error})
  await input.fill('纸上')
  await page.locator('.search-result').first().waitFor()
  await page.keyboard.press('Escape')
} finally {release();await context.close()}
console.log('PASS '+engine.name()+' '+width+': small first-page fonts, no module wait or layout jump, newest search query wins')
}
{
const context=await browser.newContext({viewport:{width:1440,height:900}})
const page=await context.newPage()
page.on('pageerror',e=>errors.push(e.message))
await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,effectiveType:'3g'}}))
let requests=0
await context.route('**/search.json',route=>++requests===1?route.abort():route.continue())
await page.goto(base+'/')
await page.waitForFunction(()=>document.documentElement.dataset.fontState==='ready')
await page.locator('.rail-actions [data-search-trigger]').click()
await page.waitForTimeout(150)
await page.locator('#search-input').fill('Markdown')
await page.locator('.search-result').first().waitFor()
assert.equal(requests,2)
await context.close()
console.log('PASS '+engine.name()+': search retries a transient failed index request')
}
{
const context=await browser.newContext({viewport:{width:1440,height:900}})
const page=await context.newPage()
page.on('pageerror',e=>errors.push(e.message))
await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,effectiveType:'3g'}}))
await context.route('**/search.json',route=>route.fulfill({json:[{title:'龘',description:'dynamicrare',content:'dynamicrare',tags:[],date:'2026-01-01',url:'/about/'}]}))
let releaseFonts
const fontGate=new Promise(resolve=>{releaseFonts=resolve})
let held=0
try {
  await page.goto(base+'/')
  await page.waitForFunction(()=>document.documentElement.dataset.fontState==='ready')
  await context.route('https://fonts.gstatic.cn/**',async route=>{held++;await fontGate;await route.continue()})
  await page.locator('.rail-actions [data-search-trigger]').click()
  await page.locator('#search-input').fill('dynamicrare')
  await expectHeld()
  assert.equal(await page.locator('.search-result').count(),0,'dynamic results wait for their original font')
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.fontState),'ready','dynamic font loading must keep the current page visible')
  await page.locator('#search-input').fill('')
  await page.waitForTimeout(150)
  releaseFonts()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.search-result').count(),0,'clearing while fonts load must discard the pending results')
  await page.locator('#search-input').fill('dynamicrare')
  await page.locator('.search-result').first().waitFor()
  assert.equal(await page.locator('.search-result__title').textContent(),'龘')
  await page.locator('#search-input').fill('龘nomatch')
  await page.locator('.search-hint').filter({hasText:'没有找到与“龘nomatch”相关的文章。'}).waitFor()
} finally {releaseFonts();await context.close()}
async function expectHeld() {
  for(let attempt=0;attempt<100&&!held;attempt++)await page.waitForTimeout(50)
  assert.ok(held>0,'rare dynamic text must request its original font')
}
console.log('PASS '+engine.name()+': dynamic search glyphs wait for their original font without hiding the page')
}
}finally{await browser.close()}
}
assert.deepEqual(errors,[])
}finally{server.close()}
