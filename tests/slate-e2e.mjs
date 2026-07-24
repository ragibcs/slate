/** Slate E2E — drives the from-scratch whiteboard in headless Chromium. */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const URL = process.argv[2] || 'http://localhost:8890/slate.html'
let failures = 0
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, d) => { failures++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`) }
const assert = (c, n, d) => (c ? ok(n) : bad(n, d))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 880 }, acceptDownloads: true })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 160)))
page.on('dialog', (d) => d.accept())

const objs = () => page.evaluate(() => window.__slate.S.objects.map((o) => o.t))
const count = () => page.evaluate(() => window.__slate.S.objects.length)

console.log('\n— Boot & welcome board —')
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
assert(await page.evaluate(() => !!window.__slate), 'engine booted')
assert((await count()) >= 5, 'welcome content seeded', `${await count()} objects`)
const mathjax = await page.evaluate(() => !!(window.MathJax && window.MathJax.tex2svg))
console.log(`  [info] MathJax loaded: ${mathjax}`)

console.log('\n— Pen drawing —')
const before = await count()
await page.mouse.move(700, 500); await page.mouse.down()
for (const [x, y] of [[760, 470], [820, 520], [880, 480], [940, 510]]) await page.mouse.move(x, y, { steps: 4 })
await page.mouse.up(); await page.waitForTimeout(200)
assert((await count()) === before + 1, 'stroke object created')
assert((await objs()).includes('s'), 'stroke type present')

console.log('\n— Shapes —')
await page.keyboard.press('r')
await page.mouse.move(700, 560); await page.mouse.down(); await page.mouse.move(860, 660, { steps: 5 }); await page.mouse.up()
await page.waitForTimeout(200)
assert((await objs()).filter((t) => t === 'r').length === 1, 'rectangle created')
await page.keyboard.press('a')
await page.mouse.move(900, 560); await page.mouse.down(); await page.mouse.move(1030, 640, { steps: 5 }); await page.mouse.up()
await page.waitForTimeout(200)
assert((await objs()).includes('a'), 'arrow created')

console.log('\n— Text tool —')
await page.keyboard.press('t')
await page.mouse.click(700, 700)
await page.waitForTimeout(300)
await page.keyboard.type('integration by parts')
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
const textObj = await page.evaluate(() => window.__slate.S.objects.find((o) => o.t === 't' && o.txt.includes('integration')))
assert(!!textObj, 'text object committed with typed content')

console.log('\n— Math blocks —')
await page.keyboard.press('m')
await page.waitForTimeout(300)
assert(await page.locator('#msheet').isVisible(), 'math editor opens')
await page.fill('#minput', '\\int_0^1 x^2\\,dx = \\tfrac{1}{3}')
await page.waitForTimeout(400)
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const mObj = await page.evaluate(() => window.__slate.S.objects.find((o) => o.t === 'm'))
assert(!!mObj, 'math object placed')
if (mathjax) {
  let ready = false
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200)
    ready = await page.evaluate(() => {
      const o = window.__slate.S.objects.filter((x) => x.t === 'm').pop()
      const e = o && window.__slate.mcache.get(o.latex + '|' + '#f2f2f0')
      return !!(e && e.ready)
    })
    if (ready) break
  }
  assert(ready, 'math rendered to vector image')
} else console.log('  [skip] math raster check (CDN unavailable in sandbox)')

console.log('\n— Select / move / delete / undo —')
const nBefore = await count()
await page.keyboard.press('v')
await page.mouse.click(820, 520) // on the stroke
await page.waitForTimeout(150)
assert((await page.evaluate(() => window.__slate.S.sel.size)) === 1, 'stroke selected by click')
const firstPt = await page.evaluate(() => { const o = window.__slate.S.objects.find((x) => x.t === 's' && x.pts.length > 3); return o.pts[0][0] })
await page.mouse.move(820, 520); await page.mouse.down(); await page.mouse.move(870, 570, { steps: 4 }); await page.mouse.up()
await page.waitForTimeout(150)
const movedPt = await page.evaluate(() => { const o = window.__slate.S.objects.find((x) => x.t === 's' && x.pts.length > 3); return o.pts[0][0] })
assert(Math.abs(movedPt - firstPt) > 10, 'selection dragged (points moved)', `${firstPt} → ${movedPt}`)
await page.keyboard.press('Delete')
await page.waitForTimeout(150)
assert((await count()) === nBefore - 1, 'delete removes selection')
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
assert((await count()) === nBefore, 'undo restores deleted object')
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
const afterUndo2 = await page.evaluate(() => { const o = window.__slate.S.objects.find((x) => x.t === 's' && x.pts.length > 3); return o.pts[0][0] })
assert(Math.abs(afterUndo2 - firstPt) < 1, 'second undo reverts the move')
await page.keyboard.press('Control+y')
await page.waitForTimeout(150)
const afterRedo = await page.evaluate(() => { const o = window.__slate.S.objects.find((x) => x.t === 's' && x.pts.length > 3); return o.pts[0][0] })
assert(Math.abs(afterRedo - movedPt) < 1, 'redo re-applies the move')

console.log('\n— Persistence across reload —')
const persistCount = await count()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
assert((await count()) === persistCount, 'board restored from localStorage', `${await count()} vs ${persistCount}`)

console.log('\n— Exports —')
await page.locator('#export-btn').click()
const dl1 = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
await page.locator('#ex-png').click()
const png = await dl1
assert(!!png, 'PNG download triggered')
if (png) {
  const buf = readFileSync(await png.path())
  assert(buf.subarray(1, 4).toString() === 'PNG', 'PNG magic bytes ok', buf.subarray(0, 4).toString('hex'))
  assert(buf.length > 20000, 'PNG has real content', `${buf.length} bytes`)
}
await page.locator('#export-btn').click()
const dl2 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
await page.locator('#ex-pdf').click()
const pdf = await dl2
if (pdf) {
  const buf = readFileSync(await pdf.path())
  assert(buf.subarray(0, 5).toString() === '%PDF-', 'PDF magic bytes ok')
  assert(buf.includes(Buffer.from('%%EOF')), 'PDF complete')
  assert(buf.length > 8000, 'PDF has real content', `${buf.length} bytes`)
} else {
  const t = await page.locator('#toast').textContent().catch(() => '')
  if (mathjax) bad('PDF download triggered', t || 'no download')
  else console.log('  [skip] PDF (jsPDF CDN unavailable in sandbox): toast=' + t)
}

console.log('\n— UI toggles & boards —')
await page.keyboard.press('g'); await page.waitForTimeout(80)
assert((await page.evaluate(() => window.__slate.S.grid)) === false, 'grid toggles off')
await page.keyboard.press('g')
await page.keyboard.press('d'); await page.waitForTimeout(80)
assert((await page.evaluate(() => document.body.dataset.theme)) === 'light', 'theme switches to light')
await page.keyboard.press('d')
await page.keyboard.press('u'); await page.waitForTimeout(300)
assert(await page.locator('#showui').isVisible(), 'hide UI shows the Show UI pill')
await page.locator('#showui').click(); await page.waitForTimeout(200)
await page.locator('#bmenu-btn').click(); await page.waitForTimeout(200)
await page.locator('#bmenu .mi').first().click() // + New board
await page.waitForTimeout(500)
assert((await count()) === 0, 'new empty board opened')
await page.locator('#bmenu-btn').click(); await page.waitForTimeout(200)
const rows = await page.locator('#bmenu .brow').count()
assert(rows >= 2, 'boards menu lists both boards', `rows=${rows}`)


console.log('\n— v0.6 features: highlighter · image · plot · smart snap —')
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
// fresh board via menu
await page.locator('#bmenu-btn').click(); await page.waitForTimeout(200)
await page.locator('#bmenu .mi').first().click(); await page.waitForTimeout(600)

// highlighter
await page.keyboard.press('l')
await page.mouse.move(500, 300); await page.mouse.down()
for (const [x, y] of [[620, 290], [740, 310], [860, 295]]) await page.mouse.move(x, y, { steps: 4 })
await page.mouse.up(); await page.waitForTimeout(250)
assert(await page.evaluate(() => window.__slate.S.objects.some(o => o.t === 's' && o.hl)), 'highlighter stroke created (hl flag)')

// image insert via exposed API (file dialogs can't be driven headlessly)
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAKklEQVR4nGP8//8/AzGAiSFVBiYGIgCjKgZGRkaiFP7//5+RaDeMKsQEAC7WBv4Xj3rMAAAAAElFTkSuQmCC'
await page.evaluate((src) => window.__slate.insertImageSrc(src, { x: 400, y: 420 }), TINY_PNG)
let imgOk = false
for (let i = 0; i < 15; i++) { await page.waitForTimeout(200)
  imgOk = await page.evaluate(() => window.__slate.S.objects.some(o => o.t === 'i' && o.src.startsWith('data:image'))); if (imgOk) break }
assert(imgOk, 'image object inserted and stored')

// plot block
await page.keyboard.press('Escape')
await page.keyboard.press('x'); await page.waitForTimeout(300)
assert(await page.locator('#psheet').isVisible(), 'plot editor opens')
await page.fill('#pexpr', 'x^2 - 3')
await page.keyboard.press('Enter'); await page.waitForTimeout(400)
const plotObj = await page.evaluate(() => window.__slate.S.objects.find(o => o.t === 'p'))
assert(!!plotObj && plotObj.expr.replace(/\s+/g,'') === 'x^2-3', 'plot object placed', JSON.stringify(plotObj && plotObj.expr))
const plotEval = await page.evaluate(() => { const f = window.__slate.compileExpr('x^2-3'); return [f(0), f(2), f(-3)] })
assert(plotEval[0] === -3 && plotEval[1] === 1 && plotEval[2] === 6, 'expression parser computes correctly', JSON.stringify(plotEval))

// smart snap: draw a rough circle then HOLD before releasing
const beforeSnap = await page.evaluate(() => window.__slate.S.objects.filter(o => o.t === 'o').length)
await page.keyboard.press('p')
const cxx = 950, cyy = 480, rr = 90
await page.mouse.move(cxx + rr, cyy); await page.mouse.down()
for (let a = 0.15; a <= Math.PI * 2.05; a += 0.15) {
  await page.mouse.move(cxx + Math.cos(a) * (rr + Math.sin(a * 5) * 5), cyy + Math.sin(a) * (rr - 3))
}
await page.waitForTimeout(500) // HOLD → snap
await page.mouse.up(); await page.waitForTimeout(300)
const afterSnap = await page.evaluate(() => window.__slate.S.objects.filter(o => o.t === 'o').length)
assert(afterSnap === beforeSnap + 1, 'rough circle snapped to a perfect ellipse', `${beforeSnap} → ${afterSnap}`)

// quick release keeps freehand
const strokesBefore = await page.evaluate(() => window.__slate.S.objects.filter(o => o.t === 's' && !o.hl).length)
await page.keyboard.press('p')
await page.mouse.move(420, 620); await page.mouse.down()
for (let a = 0.2; a <= Math.PI * 2; a += 0.25) await page.mouse.move(420 + Math.cos(a) * 60, 620 + Math.sin(a) * 60)
await page.mouse.up(); await page.waitForTimeout(250)
assert((await page.evaluate(() => window.__slate.S.objects.filter(o => o.t === 's' && !o.hl).length)) === strokesBefore + 1,
  'quick release keeps the freehand stroke (no forced snap)')

// straight line + hold → line snap (arrow without head)
await page.keyboard.press('p')
await page.mouse.move(500, 720); await page.mouse.down()
for (let i = 1; i <= 12; i++) await page.mouse.move(500 + i * 28, 720 + Math.sin(i) * 2.5)
await page.waitForTimeout(500)
await page.mouse.up(); await page.waitForTimeout(300)
assert(await page.evaluate(() => window.__slate.S.objects.some(o => o.t === 'a' && o.head === false)), 'straightish stroke + hold snapped to a clean line')

// persistence of new object types
const allTypes = await page.evaluate(() => window.__slate.S.objects.map(o => o.t).sort().join(','))
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1800)
const allTypes2 = await page.evaluate(() => window.__slate.S.objects.map(o => o.t).sort().join(','))
assert(allTypes === allTypes2, 'images/plots/highlights persist in localStorage', `${allTypes} vs ${allTypes2}`)

console.log('\n— v0.7: notebook pages —')
// switch back to the welcome board (a 2-page notebook) — earlier sections left an empty test board open
await page.evaluate(() => {
  const reg = JSON.parse(localStorage.getItem('slate.boards.v1')) || []
  const wb = reg.find(b => b.name === 'My board')
  if (wb) window.__slate.openBoard(wb.id)
})
await page.waitForTimeout(400)
const pg0 = await page.evaluate(() => ({ n: window.__slate.S.pages.length, i: window.__slate.S.page,
  thumbs: document.querySelectorAll('#pages .pg').length, count: (document.querySelector('#pgcount')?.textContent || '').trim() }))
assert(pg0.n === 2 && pg0.thumbs === 2, 'welcome board is a 2-page notebook with thumbnails', JSON.stringify(pg0))
assert(pg0.count === (pg0.i + 1) + ' / 2', 'page counter shows current / total', pg0.count)

const prevCount = await count()
await page.evaluate(() => window.__slate.addPage())
await page.waitForTimeout(250)
let st = await page.evaluate(() => ({ n: window.__slate.S.pages.length, i: window.__slate.S.page, objs: window.__slate.S.objects.length }))
assert(st.n === 3 && st.objs === 0, '+ Page inserts an empty page after the current one', JSON.stringify(st))
const newIdx = st.i

await page.keyboard.press('p')
await page.mouse.move(600, 400); await page.mouse.down()
for (const [x, y] of [[680, 360], [760, 420], [840, 380]]) await page.mouse.move(x, y, { steps: 4 })
await page.mouse.up(); await page.waitForTimeout(250)
assert((await count()) === 1, 'drawing lands on the new page only', `${await count()} objects`)

await page.evaluate(() => window.__slate.gotoPage(0)); await page.waitForTimeout(150)
assert((await count()) === prevCount, 'first page content untouched', `${await count()} vs ${prevCount}`)
await page.evaluate((i) => window.__slate.gotoPage(i), newIdx); await page.waitForTimeout(150)
assert((await count()) === 1, 'flipping back restores the new page')

await page.keyboard.press('Control+z'); await page.waitForTimeout(150)
assert((await count()) === 0, 'undo on the new page removes its stroke')
await page.keyboard.press('Control+y'); await page.waitForTimeout(150)
assert((await count()) === 1, 'redo restores it — undo history is per page')

await page.keyboard.press('PageUp'); await page.waitForTimeout(150)
assert((await page.evaluate(() => window.__slate.S.page)) === newIdx - 1, 'PageUp flips to the previous page')
await page.keyboard.press('PageDown'); await page.waitForTimeout(150)
assert((await page.evaluate(() => window.__slate.S.page)) === newIdx, 'PageDown flips forward')

const dupInfo = await page.evaluate(() => {
  const S = window.__slate.S
  const srcIds = S.objects.map(o => o.id)
  window.__slate.duplicatePage()
  return { n: S.pages.length, objs: S.objects.length, freshIds: S.objects.every(o => !srcIds.includes(o.id)),
    thumbs: document.querySelectorAll('#pages .pg').length }
})
assert(dupInfo.n === 4 && dupInfo.objs === 1 && dupInfo.freshIds, 'duplicate page copies content with fresh ids', JSON.stringify(dupInfo))
assert(dupInfo.thumbs === 4, 'page bar shows a thumbnail per page', `${dupInfo.thumbs} thumbs`)

const moved = await page.evaluate(() => { const S = window.__slate.S
  const before = S.pages.map(p => p.objects.length).join(',')
  window.__slate.movePage(S.page, 0)
  return { before, after: S.pages.map(p => p.objects.length).join(','), i: S.page }
})
assert(moved.i === 0 && moved.after !== moved.before, 'movePage reorders the notebook', JSON.stringify(moved))

console.log('\n— v0.7: multi-page PDF —')
await page.locator('#export-btn').click()
const dl3 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
await page.locator('#ex-pdf').click()
const pdf3 = await dl3
if (pdf3) {
  const buf = readFileSync(await pdf3.path())
  const nPdf = (buf.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length
  const nBoard = await page.evaluate(() => window.__slate.S.pages.filter(p => p.objects.length).length)
  assert(buf.subarray(0, 5).toString() === '%PDF-', 'multi-page PDF downloads')
  assert(nPdf === nBoard, `PDF has one page per non-empty notebook page (${nBoard})`, `pdf pages=${nPdf}`)
} else {
  const t = await page.locator('#toast').textContent().catch(() => '')
  if (mathjax) bad('multi-page PDF download', t || 'no download')
  else console.log('  [skip] PDF CDN unavailable: ' + t)
}

console.log('\n— v0.7: persistence & compatibility —')
const shape1 = await page.evaluate(() => ({ i: window.__slate.S.page, counts: window.__slate.S.pages.map(p => p.objects.length).join(',') }))
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1800)
const shape2 = await page.evaluate(() => ({ i: window.__slate.S.page, counts: window.__slate.S.pages.map(p => p.objects.length).join(',') }))
assert(shape1.counts === shape2.counts, 'all pages persist across reload', `${shape1.counts} vs ${shape2.counts}`)
assert(shape1.i === shape2.i, 'current page index persists', `${shape1.i} vs ${shape2.i}`)

const rt = await page.evaluate(async () => {
  const { compressToHash, decompressFromHash, S, syncPage } = window.__slate
  syncPage()
  const h = await compressToHash({ v: 2, name: S.boardName, pages: S.pages, page: S.page })
  const d = await decompressFromHash(h)
  return { n: Array.isArray(d.pages) ? d.pages.length : 0, want: S.pages.length }
})
assert(rt.n === rt.want, 'board → hash → board round trip keeps all pages (full-app handoff)', JSON.stringify(rt))

const mig = await page.evaluate(() => {
  const legacy = { name: 'Legacy v1', objects: [{ t: 't', id: 'zz1', x: 0, y: 0, txt: 'old-format', c: 'ink', fs: 24, f: 'hand' }], cam: { x: 0, y: 0, z: 1 } }
  localStorage.setItem('slate.b.legacy1', JSON.stringify(legacy))
  const reg = JSON.parse(localStorage.getItem('slate.boards.v1')) || []
  reg.unshift({ id: 'legacy1', name: 'Legacy v1', up: Date.now() })
  localStorage.setItem('slate.boards.v1', JSON.stringify(reg))
  window.__slate.openBoard('legacy1')
  const S = window.__slate.S
  return { pages: S.pages.length, txt: S.objects[0] && S.objects[0].txt, objs: S.objects.length }
})
assert(mig.pages === 1 && mig.txt === 'old-format', 'legacy single-page boards migrate to 1-page notebooks', JSON.stringify(mig))

const guard = await page.evaluate(() => {
  const S = window.__slate.S
  const r1 = window.__slate.deletePage()      // only page → refused
  window.__slate.addPage()                    // now 2 pages
  const r2 = window.__slate.deletePage()      // deleting works
  return { r1, r2, n: S.pages.length }
})
assert(guard.r1 === false && guard.r2 === true && guard.n === 1, 'last page is protected; deleting otherwise works', JSON.stringify(guard))

await browser.close()
console.log(failures === 0 ? '\nALL SLATE CHECKS PASSED ✅' : `\n${failures} CHECK(S) FAILED ❌`)
process.exit(failures ? 1 : 0)
