# Visio viewer (`visio`)

Supports `.vsdx` (XML/ZIP drawings) and `.vsd` (binary compound drawings) at
level 3: graphical pages with shapes, connectors and text. Page navigation,
fit, zoom, pan and rotation share the existing InteractiveViewport. No editing,
macros, external-resource loading or shape-property inspector. Fonts, OLE
objects and proprietary effects can differ from Microsoft Visio.

The manifest and bounded container probe are separate lazy entries. The full
plugin starts a dedicated module Worker, loads the same-origin locked runtime,
transfers the input buffer, and displays only the selected page as a static SVG
image. Original file contents never leave the browser. The Worker is a thin
message wrapper over [src/engine.ts](src/engine.ts). The engine validates
Visio structure independently of the ZIP/OLE header probe.

See [runtime recipe](../../../tools/libvisio-build/README.md) for input, memory,
page, output and time budgets, corresponding source distribution, dependencies
and rebuild instructions. Sample provenance is in
[examples](examples/README.md).

## Agent extract

[src/extract.ts](src/extract.ts) loads the same libvisio assets through
`context.vendor` in a Node worker and summarizes each page's SVG output:

- `inspect`: format (`vsd`/`vsdx`), page count, distinct page sizes (inches),
  totals of groups, drawing elements and text blocks; one `page:<n>` target per
  page.
- `read`: Markdown per page (size, counts, then one bullet per text block);
  default reads all pages. `filter` keeps matching text blocks; `line:` cursors.
- Not available: page names, master names and shape properties (the WASM
  adapter only exposes per-page SVG), and `render`.

## Development and verification

- [Manifest](src/manifest.ts), [probe](src/probe.ts), [open entry](src/index.ts).
- `node tools/libvisio-build/smoke.mjs <runtime-dir> <fixtures-dir>` runs the real WASM against upstream fixtures.
- Real-browser check: colors, text and arrows, page selection, zoom/fit/rotation,
  narrow viewport; network requests contain only fixed runtime assets.

```bash
pnpm test viewer/plugins/visio
```
