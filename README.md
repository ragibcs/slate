# ✎ Slate — personal math whiteboard

**One self-contained HTML file. No accounts, no cloud, no watermark, no build step.**

A from-scratch infinite whiteboard in the spirit of Miro, built for personal use and
math teaching: pressure ink with smart shape snapping, LaTeX math blocks, function
plots, images, sticky notes — and notebook-style **multi-page boards** that export
as a **multi-page PDF**.

Current build: `slate v0.7 — notebook pages · multi-page PDF`

---

## Run it

Open `slate.html` in any modern browser. That's the whole install.

- Boards **auto-save to the browser** (localStorage), including all pages.
- **Export → PDF** downloads one A4 PDF with a page per notebook page.
- Works offline except two CDN loads: MathJax (math blocks) and jsPDF (PDF export).
  Everything else — drawing, pages, plots, PNG/JSON export — is fully offline.

> Tip: if you host it in a *sandboxed iframe* (e.g. an embed that blocks downloads
> and storage), Slate detects that automatically: exports switch to an in-app
> overlay (right-click to save / Print → Save as PDF) and boards run in-memory
> with an amber "preview" indicator. In a normal tab everything is one-click.

## Tools & shortcuts

| Tool | Key | | Tool | Key |
|---|---|---|---|---|
| Select | `V` | | Text | `T` |
| Hand / pan | `H` | | Sticky note | `N` |
| Pen | `P` | | Code block | `C` |
| Highlighter | `L` | | **Math (LaTeX)** | `M` |
| Eraser | `E` | | **Image** | `I` (or paste / drag-drop) |
| Rectangle | `R` | | **Function plot** | `X` |
| Ellipse | `O` | | Arrow | `A` |

- **Pages**: left bar — `+ Page`, click thumbnails to flip, drag to reorder,
  hover for duplicate/delete. `PgUp` / `PgDn` flip pages. Undo history and zoom
  are **per page**.
- **Smart snap**: draw a rough line / circle / rectangle and **hold still** for a
  beat before releasing — Slate replaces it with a clean shape. Release quickly to
  keep freehand.
- **Plots**: press `X`, type e.g. `x^2 - 3`, `sin(x)*x`, `1/x`. Safe hand-rolled
  expression compiler (no `eval`): `sin cos tan asin acos atan sqrt abs ln log exp
  floor ceil sinh cosh tanh`, constants `pi` `e`, powers `^`, implicit
  multiplication (`2x`, `3sin(x)`). Double-click a plot to edit.
- Undo/redo `Ctrl+Z` / `Ctrl+Y` · duplicate `Ctrl+D` · copy/paste `Ctrl+C/V` ·
  zoom `Ctrl+wheel`, `F` fit · grid `G` · snap-to-grid `S` · theme `D` · hide UI `U`.
- Double-click any text / note / code / math / plot to edit it.

## Board format

Boards persist as JSON (also what **Export → Backup** gives you):

```jsonc
{
  "v": 2,
  "name": "Calculus notes",
  "page": 1,                      // last open page index
  "pages": [
    { "objects": [ /* ... */ ], "cam": { "x": 0, "y": 0, "z": 1 } }
  ]
}
```

Object types: `s` stroke (`pts: [[x,y,pressure]]`, `hl: true` = highlighter) ·
`r` rect · `o` ellipse · `a` arrow · `t` text · `n` note · `c` code ·
`m` math (`latex`) · `i` image (`src` data-URL) · `p` plot (`expr, xmin, xmax`).

Legacy v1 backups (`{ name, objects, cam }`) import fine — they migrate to
1-page notebooks automatically.

## Tests

Headless-browser end-to-end suites (Playwright, Chromium):

```bash
npm i playwright-core
npx playwright install chromium-headless-shell   # once

# serve the folder, then:
python3 -m http.server 8900 &
node tests/slate-e2e.mjs          http://localhost:8900/slate.html   # 57 checks
node tests/slate-sandbox-test.mjs http://localhost:8900/slate.html   # blocked-storage env
node tests/slate-pdf-repro.mjs    http://localhost:8900/slate.html   # sandboxed-iframe exports
```

`slate-e2e.mjs` covers: drawing/shapes/text/math, select-move-undo-redo,
localStorage persistence, PNG + PDF byte verification, v0.6 features
(highlighter, image insert, plot compiler, smart snap), and v0.7 notebook pages
(per-page undo, reorder/duplicate/delete, **multi-page PDF page count**, reload
persistence, legacy migration). `slate-v7-shot.mjs` recreates the showcase
screenshot.

## Notes

- Rendering: single `<canvas>`, variable-width filled-outline ink
  (perfect-freehand technique, hand-rolled), scene-snapshot fast path while
  drawing (O(1) per frame regardless of board size).
- Math: MathJax tex-svg → SVG → cached bitmaps, so equations stay crisp at any zoom.
- Everything lives in `slate.html` — readable, commented, ~1,900 lines.
