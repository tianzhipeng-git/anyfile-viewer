# libvisio WebAssembly recipe

`bash tools/libvisio-build/build.sh /absolute/output/directory`

The pinned Emscripten 4.0.10 image compiles unmodified libvisio 0.1.11,
librevenge 0.0.5 and libxml2 2.15.4 with a small embind adapter. ICU, Boost
and zlib are Emscripten ports: the image pins their recipes and checks their
source hashes; this recipe verifies SHA-256 as well. `icupkg` 70.1-2 extracts
only legacy Windows converters and their dependencies. Source archives,
notices, input hashes, adapter hashes and output hashes accompany the runtime.

Why source build: the named `@discere-os/libvisio.wasm` npm package returned
404 during evaluation. VSDX-only JavaScript parsers cannot handle binary VSD;
a complete LibreOffice runtime is unnecessarily large. A narrow adapter over
libvisio gives both formats without maintaining an upstream fork.

No ordinary application command compiles native sources. Review the generated
output, run smoke tests, then place it at
`third_party/libvisio/0.1.11-anyfile.1/`. `pnpm prepare:visio` verifies and copies
it to `public/vendor/libvisio/0.1.11-anyfile.1/`.

Smoke test (Node 24):

```sh
node tools/libvisio-build/smoke.mjs third_party/libvisio/0.1.11-anyfile.1 viewer/plugins/visio/examples
```

For the full upstream regression set, extract `sources/libvisio.tar.xz` into a
temporary directory and pass `libvisio-0.1.11/src/test/data` as the last argument.
Two upstream malformed-structure fixtures contain zero-size pages; the browser
rejects those pages before image decoding. Other fixture pages must contain
actual drawing elements. Compare `visio.mjs`, `visio.wasm` and `converters.dat`
SHA-256 values across rebuilds before approving a new version.

## Runtime boundaries

128 MiB input; a 512 MiB WASM memory ceiling; at most 512 pages; 64 MiB total
SVG and 16 MiB per page. Native generation checks page/output budgets and
returns a resource-limit result. The client terminates parsing after 30 seconds
or cancellation. Image dimensions are checked before decoding (32,768 px per
axis, 100 million pixels). Only one page is mounted and decoded at a time.
The parser still collects all bounded SVG pages internally; this is not a
streaming parser and the input limit does not guarantee every large file opens.

SVG is loaded through `<img>` (secure static SVG image context), never inserted
as application markup. Scripts and remote subresources are disabled by browser
image semantics. No macros, remote relationships or linked file fetches run.

## Dependency review

libvisio 0.1.11 includes upstream memory-safety fixes; libxml2 uses release
2.15.4 rather than the older 2.14 release. libvisio disables XML entity expansion.
ICU 68.2 is the pinned Emscripten port; this binary uses character conversion
only, without ICU regex, layout or locale data. No known applicable critical
issue was identified in this integration review; this is not a security audit.
Update pinned dependencies and repeat fixture and browser checks on upgrades.
