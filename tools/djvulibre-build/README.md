# Source-built DjVu runtime

Run `bash tools/djvulibre-build/build.sh third_party/djvulibre/3.5.29-anyfile.1` with Docker and Node 24. Upstream tarball URL and SHA-256 are pinned in `upstream.json`; the output includes the corresponding upstream source archive, `COPYING`, `COPYRIGHT`, `SOURCE.md`, full build recipe, and `build-info.json`.

The decoder compiles unmodified DjVuLibre 3.5.29 except for `patches/single-thread-emscripten.patch`, which runs `GThread::create()` synchronously when compiled without Emscripten pthreads so the decoder works inside a single Web Worker without requiring `SharedArrayBuffer`. Memory starts at 16 MiB, grows up to 512 MiB, and uses a 2 MiB C stack with overflow checks. Application builds (`pnpm prepare:djvu`) verify SHA-256 hashes and copy artifacts without compiling native code.

Smoke test (Node 24):

```sh
node tools/djvulibre-build/smoke.mjs third_party/djvulibre/3.5.29-anyfile.1 viewer/plugins/djvu/examples/lizard2002.djvu
```
