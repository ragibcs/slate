/** Reproduces the sandboxed-iframe environment: localStorage access THROWS.
    The app must still boot, draw, write text, and place math. */
import { chromium } from 'playwright-core'

const URL = process.argv[2] || 'http://localhost:8890/slate.html'
let failures = 0
const assert = (c, n, d) => (c ? console.log(`  ✓ ${n}`) : (failures++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 140)))
// simulate sandboxed iframe: any localStorage touch throws SecurityError
await page.addInitScript(() => {
  Object.defineProperty(window, 'localStorage', {
    get() { throw new DOMException('The document is sandboxed', 'SecurityError') },
  })
})

console.log('\n— Blocked-storage environment (sandboxed iframe simulation) —')
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
assert(await page.evaluate(() => !!window.__slate), 'engine boots with storage blocked')
assert(await page.evaluate(() => window.__slate.S.objects.length >= 5), 'welcome board present (in-memory)')

const before = await page.evaluate(() => window.__slate.S.objects.length)
await page.mouse.move(700, 480); await page.mouse.down()
for (const [x, y] of [[770, 440], [840, 500], [910, 450]]) await page.mouse.move(x, y, { steps: 4 })
await page.mouse.up(); await page.waitForTimeout(250)
assert((await page.evaluate(() => window.__slate.S.objects.length)) === before + 1, 'PEN DRAWS with storage blocked')

await page.keyboard.press('t'); await page.mouse.click(700, 620); await page.waitForTimeout(250)
await page.keyboard.type('storage-proof'); await page.keyboard.press('Escape'); await page.waitForTimeout(200)
assert(await page.evaluate(() => window.__slate.S.objects.some((o) => o.t === 't' && o.txt === 'storage-proof')), 'text tool works')

await page.keyboard.press('m'); await page.waitForTimeout(250)
await page.fill('#minput', 'e^{i\\pi}+1=0'); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
const nWithMath = await page.evaluate(() => window.__slate.S.objects.length)
assert(await page.evaluate(() => window.__slate.S.objects.some((o) => o.latex === 'e^{i\\pi}+1=0')), 'math block placed')

await page.keyboard.press('Control+z'); await page.waitForTimeout(200)
assert(
  (await page.evaluate(() => window.__slate.S.objects.length)) === nWithMath - 1 &&
    !(await page.evaluate(() => window.__slate.S.objects.some((o) => o.latex === 'e^{i\\pi}+1=0'))),
  'undo works (removes the placed equation)'
)

await browser.close()
console.log(failures === 0 ? '\nSANDBOX-MODE CHECKS PASSED ✅' : `\n${failures} CHECK(S) FAILED ❌`)
process.exit(failures ? 1 : 0)
