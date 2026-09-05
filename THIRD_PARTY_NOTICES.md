# Anyfile Viewer third-party notices

Anyfile Viewer is licensed under the Apache License, Version 2.0. That license
applies only to project-owned material. The third-party components below remain
under their own licenses. The exact installed versions are locked by
`pnpm-lock.yaml`; `pnpm licenses list --prod` provides the complete installed
production dependency closure.

The optional EPS/PostScript viewer also uses a source-built `stet` 0.8.1
WebAssembly runtime under Apache-2.0 OR MIT. Exact source, hashes, build
instructions, and license texts are published with
`/vendor/stet/0.8.1-anyfile.1/`.

## Browser application dependencies

| Component | Version | License | Source |
|---|---:|---|---|
| `@aiden0z/pptx-renderer` | 1.2.4 | Apache-2.0 | <https://github.com/aiden0z/pptx-renderer> |
| `@base-ui/react` | 1.7.0 | MIT | <https://github.com/mui/base-ui> |
| `@duckdb/duckdb-wasm` | 1.32.0 | MIT | <https://github.com/duckdb/duckdb-wasm> |
| `@zip.js/zip.js` | 2.8.60 | BSD-3-Clause | <https://github.com/gildas-lormeau/zip.js> |
| `ag-psd` | 31.0.2 | MIT | <https://github.com/Agamnentzar/ag-psd> |
| Ace | 1.44.0 | BSD-3-Clause | <https://github.com/ajaxorg/ace> |
| Apache Arrow JS | 17.0.0 | Apache-2.0 | <https://github.com/apache/arrow-js> |
| class-variance-authority | 0.7.1 | Apache-2.0 | <https://github.com/joe-bell/cva> |
| clsx | 2.1.1 | MIT | <https://github.com/lukeed/clsx> |
| docx-preview | 0.4.0 | Apache-2.0 | <https://github.com/VolodymyrBaydalka/docxjs> |
| GeoTIFF.js | 3.0.5 | MIT | <https://github.com/geotiffjs/geotiff.js> |
| jxl-oxide-wasm | 0.12.6 | MIT OR Apache-2.0 | <https://github.com/tirr-c/jxl-oxide> |
| Lucide | 1.34.0 | ISC | <https://github.com/lucide-icons/lucide> |
| Mediabunny | 1.55.3 | MPL-2.0 | <https://github.com/Vanilagy/mediabunny/tree/v1.55.3> |
| Next.js | 16.3.3 | MIT | <https://github.com/vercel/next.js> |
| OGV.js | 1.9.0 | MIT; bundled Ogg codecs use their accompanying BSD-style terms | <https://github.com/brion/ogv.js> |
| PDF.js | 6.2.108 | Apache-2.0 | <https://github.com/mozilla/pdf.js> |
| React and React DOM | 19.2.8 | MIT | <https://github.com/facebook/react> |
| SheetJS | 0.20.3 | Apache-2.0 | <https://git.sheetjs.com/sheetjs/sheetjs> |
| sql.js | 1.14.2 | MIT; SQLite is public domain | <https://github.com/sql-js/sql.js> |
| tailwind-merge | 3.6.0 | MIT | <https://github.com/dcastil/tailwind-merge> |
| tw-animate-css | 1.4.0 | MIT | <https://github.com/Wombosvideo/tw-animate-css> |

Copyright and license notices shipped inside these packages remain applicable
to them and to their transitive dependencies. Binary and minified browser
distribution does not relicense those components as Apache-2.0.

The installed production dependency closure also contains Sharp 0.35.4
(Apache-2.0) and its platform-specific libvips package (LGPL-3.0-or-later)
through Next.js. The application does not import Sharp or `next/image`, so
these native packages are not part of the browser runtime. A Docker image,
offline bundle, or other distribution that includes the installed
`node_modules` tree must also preserve the Sharp/libvips notices and satisfy
the applicable LGPL source and replacement requirements.

## Mediabunny

Mediabunny source files are bundled into browser JavaScript without upstream
modification. Its MPL-2.0 text and exact source-availability notice are
distributed at `/vendor/licenses/mediabunny/1.55.3/`. If Anyfile modifies a
Mediabunny covered source file in the future, that modified file must remain
available under MPL-2.0.

## LibRaw WebAssembly runtime

The browser runtime at `/vendor/libraw/1.6.0/` contains `libraw-wasm` and
statically compiled upstream libraries. Anyfile selects CDDL-1.0, rather than
the alternative LGPL-2.1 license, for the included LibRaw 0.22.1 code.

The distributed runtime includes the following license and source materials:

- libraw-wasm 1.6.0: ISC;
- LibRaw 0.22.1: CDDL-1.0, with its copyright notice;
- Little CMS 2.19.1: MIT;
- Emscripten 5.0.7 runtime: MIT and University of Illinois/NCSA dual license;
- IJG libjpeg 9f: IJG license;
- libpng 1.6.55: libpng license;
- zlib 1.3.1: zlib license.

Exact commits, source archive hashes, build inputs, and source URLs are in the
runtime's `SOURCE.md`. This software is based in part on the work of the
Independent JPEG Group.

## HEIF WebAssembly runtime

The HEIF fallback contains unmodified libheif 1.23.2 and libde265 1.1.1 under
LGPL-3.0-or-later. Their complete license texts, corresponding-source
instructions, build inputs, hashes, and replacement instructions accompany the
runtime at `/vendor/libheif/1.23.2-anyfile.1/`.

HEVC patent or royalty obligations are separate from open-source copyright
licenses. No Anyfile license grants third-party codec patent rights.

## PDF.js support assets

PDF.js support assets retain the upstream CMap, ICC, Foxit-font, and Liberation
font notices copied into `/vendor/pdfjs/6.2.108/`. Those notices govern the
corresponding data and font files independently of the Anyfile license.

## 3D viewing additions

- Three.js 0.185.1 — MIT, https://github.com/mrdoob/three.js . Used by the local
  3D viewport and selected format addons. The upstream license is retained in
  the installed package (`three/LICENSE`).
- zip.js 2.8.60 — BSD-3-Clause, https://github.com/gildas-lormeau/zip.js . The
  existing project dependency is also used for bounded 3MF ZIP extraction.
- dxf-parser 1.1.2 — MIT, https://github.com/gdsestimating/dxf-parser . Existing
  DXF parsing dependency, now invoked in a Worker with XYZ output preserved.

No OpenCascade/occt-import-js binary is distributed by these additions. Its
preliminary evaluation and unmet integration requirements are recorded in
`docs/3d/dependency-audit.md`.

## CAD and compressed point clouds

- occt-import-js 0.0.23-anyfile.1: LGPL-2.1, with Open CASCADE LGPL-2.1 and OCCT exception. Complete notices, pinned corresponding source links and build patch are in `third_party/occt-import-js/0.0.23-anyfile.1/` and copied to `/vendor/occt-import-js/0.0.23-anyfile.1/`.
- laz-perf 0.0.7-anyfile.1: Apache-2.0. Upstream source, license and WASM provenance are in `third_party/laz-perf/0.0.7-anyfile.1/`, copied beside the runtime.

## Ebook test fixtures: Abel font

`docs/ebooks/fixtures/fonts/Abel-Regular.ttf` and the generated `resources.epub`
contain the Abel font from Google Fonts commit
`3b99d83d2625944fc0b8bd328d793fa819b92381` (`ofl/abel`).
The font is distributed under the SIL Open Font License 1.1. The complete notice
and license are preserved in `docs/ebooks/fixtures/fonts/OFL.txt`; exact source
URLs and SHA-256 hashes are in `docs/ebooks/fixtures/manifest.json`.
This is a test input, not an application runtime font.
