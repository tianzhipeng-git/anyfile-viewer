# Design Source Viewer (`@anyfile/design-source-viewer`)

Local browser viewer for Figma (`.fig`) and Sketch (`.sketch`) design source files.

## Capabilities

- **Figma (`.fig`)**:
  - Unpacks `.fig` ZIP archives (`canvas.fig`, `meta.json`, `thumbnail.png`, `images/*`) as well as raw `fig-kiwi` / `fig-jam.` / `fig-deck` binary streams.
  - Pure-TypeScript, CSP-safe (no `eval` / `new Function`) Kiwi binary schema and message decoder supporting both raw Deflate and Zstandard (`fzstd`) compressed chunks.
  - Reconstructs pages, artboards/frames, groups, shapes, text layers, fills, strokes, and embedded raster images.
- **Sketch (`.sketch`)**:
  - Parses Sketch 43+ ZIP archives (`document.json`, `meta.json`, `pages/*.json`, `previews/preview.png`, `images/*`).
  - Reconstructs pages, artboards, symbols, shapes, bezier paths, styles, and `attributedString` typography.
- **Interactive UI**:
  - 2D Canvas rendering with pan/zoom/fit/100% (`@anyfile/viewer-rendering`) and click-to-select layer hit-testing with live dimension overlays.
  - Embedded preview thumbnail toggle (`thumbnail.png` / `previews/preview.png`) when present.
  - Page switcher, artboard quick-jump, searchable layer tree, and Inspector panel with position/size, typography, copyable text content, copyable CSS snippet, and fill/stroke color swatches.

## Dependencies & Budgets

- `fflate@0.8.3` (ZIP & Deflate), `fzstd@0.1.1` (Zstandard). No WASM or external runtime assets.
- Input file limit: 128 MiB; uncompressed archive limit: 64 MiB; max 60,000 nodes; max 256 embedded images (32 MiB total).

## Known Limitations

- Complex vector boolean operations, blur/shadow effects, blend modes, auto-layout reflow, and custom local fonts are approximated on the 2D Canvas; users can switch to the embedded preview thumbnail when available.
- Legacy pre-Sketch-43 SQLite `.sketch` files are rejected during probe.
- Read-only inspection; no editing or exporting back to `.fig` / `.sketch`.

## Agent extract (`./extract`)

[src/extract.ts](src/extract.ts) reuses the same `parseDesignDocument()` ([src/document.ts](src/document.ts)) in Node:

- `inspect`: format, title, Kiwi / Sketch version, export time, page / artboard / layer / text-layer / image counts, fonts, thumbnail presence and per-page artboard and layer counts; targets are `page:<n>`.
- `read`: Markdown; each page is an indented layer tree `[kind] name (W×H)` with hidden / image-fill flags and text-layer contents quoted below. Without `target` all pages are paged by byte offset; `filter` keeps matching lines.
- Image bytes, thumbnails, fills, strokes and vector paths are not exported; preview-only `.fig` files have no pages.

## Verification

```bash
pnpm test viewer/plugins/design-source
```
