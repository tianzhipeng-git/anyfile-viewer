# Visio viewer

Supports `.vsdx` (XML/ZIP drawings) and `.vsd` (binary compound drawings) at
level 3: graphical pages with shapes, connectors and text. Page navigation,
fit, zoom, pan and rotation share the existing InteractiveViewport. No editing,
macros, external-resource loading or shape-property inspector. Fonts, OLE
objects and proprietary effects can differ from Microsoft Visio.

The manifest and bounded container probe are separate lazy entries. The full
plugin starts a dedicated module Worker, loads the same-origin locked runtime,
transfers the input buffer, and displays only the selected page as a static SVG
image. Original file contents never leave the browser. The engine validates
Visio structure independently of the ZIP/OLE header probe.

See [runtime recipe](../../tools/libvisio-build/README.md) for input, memory,
page, output and time budgets, corresponding source distribution, dependencies
and rebuild instructions. Sample provenance is in
[examples](../../viewer/plugins/visio/examples/README.md).

## Validation — 2026-10-04

- Node 24 executes the actual WASM against all 34 upstream VSD/VSDX fixtures,
  producing 37 SVG pages. Two malformed-structure regression fixtures include
  zero-size pages; those are rejected by the browser page-size validator.
- The three checked-in samples produce four nonempty drawing pages.
- Eight plugin tests cover signatures, corrupted/oversized input, successful
  rendering, page changes, opening/active cancellation, repeated disposal,
  parser timeout and pre-decode page bounds. Application tests: 120 passed.
- TypeScript, ESLint and production build including plugin/bundle/asset gates
  passed. Cold runtime assets total approximately 859 KiB gzip, same origin.
- A clean native rebuild matched both glue and WASM SHA-256 hashes exactly;
  re-extracting ICU converters also produced byte-identical data.
- Real Chrome: VSD arrows/text and VSDX colored geometry displayed; English
  and Chinese UI, zoom, 2-page navigation and 640×480 viewport checked through
  temporary same-origin sample URLs. File-chooser automation timed out, so
  the real OS picker was not verified. Temporary public test files removed.
- Production deployment headers and other browser engines remain unverified;
  no deployment was performed.
