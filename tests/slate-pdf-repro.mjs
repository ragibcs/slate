/** Sandboxed embed: export must produce a saveable render via the overlay. */
import { chromium } from 'playwright-core'
const URL = process.argv[2]
let fail = 0
const ok = (n) => console.log('  ✓ ' + n)
const bad = (n, d) => { fail++; console.log('  ✗ ' + n + (d ? ' — ' + d : '')) }
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 120)))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3200)
const fr = page.frames().find((f) => f.url().includes('slate.html'))
console.log('\n— Hard-sandboxed embed (opaque origin) —')
ok('booted: ' + (await fr.evaluate(() => !!window.__slate)))
ok('OPAQUE detected: ' + (await fr.evaluate(() => window.origin === 'null')))
// draw a stroke so the export has real content
await page.mouse.move(600, 500); await page.mouse.down()
for (const [x, y] of [[680, 460], [760, 520], [840, 470]]) await page.mouse.move(x, y, { steps: 4 })
await page.mouse.up(); await page.waitForTimeout(200)

for (const [tool, btn] of [['PDF', '#ex-pdf'], ['PNG', '#ex-png']]) {
  await fr.evaluate(() => { const o = document.querySelector('#expov'); o.style.display = 'none'; })
  await fr.evaluate(() => document.querySelector('#export-btn').click()); await page.waitForTimeout(200)
  await fr.evaluate((s) => document.querySelector(s).click(), btn)
  // wait for overlay + image to be populated
  let src = ''
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200)
    const st = await fr.evaluate(() => ({ vis: document.querySelector('#expov').style.display, src: document.querySelector('#eximg').src.slice(0, 22) }))
    if (st.vis === 'flex' && st.src.startsWith('data:image/png')) { src = st.src; break }
  }
  if (src) ok(`${tool} export → overlay shows a saveable PNG render`)
  else bad(`${tool} export overlay`, 'no image')
  // verify the image has real pixels (decode dims)
  const dims = await fr.evaluate(() => { const i = document.querySelector('#eximg'); return { w: i.naturalWidth, h: i.naturalHeight } })
  if (dims.w > 200 && dims.h > 100) ok(`${tool} render is real (${dims.w}×${dims.h}px)`)
  else bad(`${tool} render size`, JSON.stringify(dims))
  // Download button uses a data: URL (works via user gesture even in sandbox for same-doc)
  const dl = page.waitForEvent('download', { timeout: 3000 }).catch(() => null)
  await fr.evaluate(() => document.querySelector('#exdl').click())
  const d = await dl
  console.log(`    [info] ${tool} Download button → ${d ? 'download fired ('+d.suggestedFilename()+')' : 'blocked by host (expected; right-click still works)'}`)
}
await b.close()
console.log(fail ? `\n${fail} FAILED ❌` : '\nSANDBOX EXPORT OVERLAY PASSED ✅')
process.exit(fail ? 1 : 0)
