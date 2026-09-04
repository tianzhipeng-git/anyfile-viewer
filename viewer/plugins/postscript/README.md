# PostScript viewer (`postscript-document`)

Renders `.eps`, `.epsf`, `.epsi`, `.ps`, and legacy PostScript-based `.ai` files locally with the version-locked, PS/EPS-only `stet-wasm` runtime. PDF-compatible `.ai` files continue to route to the PDF.js plugin through signature probes. The interpreter and rasterizer run in a disposable Worker; the selected file is never uploaded.

The runtime loads on demand from a commit-pinned jsDelivr URL, then falls back to the same-version `assets.anyfile.top` R2 mirror and finally the versioned same-origin asset. Each failed initialization is discarded with its Worker before the next source is tried.

The viewer reports support level 3 because browser WASM cannot use system fonts and unsupported PostScript operators or unembedded fonts can reduce fidelity. Files are limited to 64 MiB, individual canvas renders to 16 million pixels, and Worker operations to 20 seconds.
