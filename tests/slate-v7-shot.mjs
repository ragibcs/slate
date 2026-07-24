/** v0.7 showcase: a 3-page calculus notebook with the page bar visible. */
import { chromium } from 'playwright-core'

const URL = process.argv[2] || 'http://localhost:8917/slate.html'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2600)

await page.evaluate(() => {
  const { S } = window.__slate
  const uid = () => 'o' + Math.random().toString(36).slice(2, 10)
  const wave = (x, y, len, amp = 3) => {
    const pts = []
    for (let i = 0; i <= len; i += 6) pts.push([x + i, y + Math.sin(i / 9) * amp, 0.6])
    return pts
  }
  const p1 = [
    { t: 't', id: uid(), x: 40, y: 30, txt: 'Calculus — derivatives', c: 'ink', fs: 42, f: 'hand' },
    { t: 't', id: uid(), x: 46, y: 104, txt: 'Differentiate:', c: 'red', fs: 27, f: 'hand' },
    { t: 'm', id: uid(), x: 250, y: 100, latex: 'f(x)=3x^2+5x-7', s: 1.02, c: 'ink' },
    { t: 'm', id: uid(), x: 120, y: 210, latex: "f'(x)=\\frac{d}{dx}(3x^2)+\\frac{d}{dx}(5x)-\\frac{d}{dx}(7)", s: 1, c: 'ink' },
    { t: 'm', id: uid(), x: 120, y: 320, latex: "\\therefore\\ f'(x)=6x+5", s: 1.08, c: 'red' },
    { t: 's', id: uid(), pts: wave(150, 300, 60), c: 'red', w: 2.6 },
    { t: 'n', id: uid(), x: 700, y: 60, w: 230, h: 140, txt: 'Power rule: bring the exponent down', bg: 'amber', fs: 20 },
  ]
  const p2 = [
    { t: 't', id: uid(), x: 40, y: 30, txt: 'Integration practice', c: 'ink', fs: 42, f: 'hand' },
    { t: 'm', id: uid(), x: 90, y: 130, latex: '\\int_0^{\\pi}\\sin x\\,dx=\\Big[-\\cos x\\Big]_0^{\\pi}=2', s: 1.12, c: 'ink', tag: 'int' },
    { t: 'p', id: uid(), x: 640, y: 90, w: 380, h: 280, expr: 'sin(x)', xmin: -6.5, xmax: 6.5, c: 'teal' },
    { t: 't', id: uid(), x: 96, y: 292, txt: 'area under one arch = 2', c: 'red', fs: 26, f: 'hand' },
  ]
  const p3 = [
    { t: 't', id: uid(), x: 40, y: 30, txt: 'Homework — parabolas', c: 'ink', fs: 42, f: 'hand' },
    { t: 'p', id: uid(), x: 60, y: 120, w: 360, h: 270, expr: 'x^2-3', xmin: -6.5, xmax: 6.5, c: 'purple' },
    { t: 'o', id: uid(), x: 560, y: 160, w: 180, h: 180, c: 'red', sw: 2.6 },
    { t: 't', id: uid(), x: 545, y: 366, txt: 'roots at ±√3', c: 'red', fs: 26, f: 'hand' },
    { t: 'n', id: uid(), x: 800, y: 130, w: 220, h: 150, txt: 'Quiz on Friday — pages export as one PDF', bg: 'purple', fs: 20 },
  ]
  S.boardName = 'Calculus notes'
  document.querySelector('#bname').value = S.boardName
  S.pages = [
    { objects: p1, cam: { x: 0, y: 0, z: 1 } },
    { objects: p2, cam: { x: 0, y: 0, z: 1 } },
    { objects: p3, cam: { x: 0, y: 0, z: 1 } },
  ]
  S.page = -1
  window.__slate.gotoPage(1)
})

// let MathJax rasterize everything on every page
for (let i = 0; i < 45; i++) {
  await page.waitForTimeout(200)
  const done = await page.evaluate(() => {
    const { S, renderMath } = window.__slate
    let all = true
    for (const p of S.pages) for (const o of p.objects) if (o.t === 'm') {
      const e = renderMath(o); if (!e || (!e.ready && !e.error)) all = false
    }
    return all
  })
  if (done) break
}
// with math rasterized, sweep a highlighter across the "…= 2" tail of the
// integral (real bounds) and point a red arrow at it from the caption
await page.evaluate(() => {
  const { S, bounds } = window.__slate
  const uid = () => 'o' + Math.random().toString(36).slice(2, 10)
  const pg2 = S.pages[1]
  const m = pg2.objects.find(o => o.tag === 'int')
  const b = bounds(m)
  const y = b.y + b.h * 0.52, x1 = b.x + b.w * 0.80, x2 = b.x + b.w * 0.985
  const pts = []
  const n = 14
  for (let i = 0; i <= n; i++) pts.push([x1 + (x2 - x1) * i / n, y + Math.sin(i * 1.3) * 1.6, 0.72])
  pg2.objects.push({ t: 's', id: uid(), pts, c: 'amber', w: 11, hl: true })
  pg2.objects.push({ t: 'a', id: uid(), x1: b.x + b.w * 0.56, y1: b.y + b.h + 96, x2: (x1 + x2) / 2 - 8, y2: b.y + b.h + 12, c: 'red', sw: 2.4 })
  S.dirty = true
})
await page.waitForTimeout(300)
await page.evaluate(() => { window.__slate.zoomFit(); window.__slate.renderPageBar() })
await page.waitForTimeout(700)
await page.evaluate(() => window.__slate.renderPageBar())  // thumbs again, post-math
await page.waitForTimeout(300)
await page.screenshot({ path: '/agent/workspace/slate-v7.png' })
await browser.close()
console.log('saved /agent/workspace/slate-v7.png')
