# DjVuLibre browser runtime 3.5.29-anyfile.1

Core: DjVuLibre 3.5.29 (`libdjvulibre`), GPL-2.0-or-later. See `COPYING`, `COPYRIGHT`, and the included corresponding source archive `djvulibre-source.tar.gz`. Exact source hashes and the Emscripten 4.0.10 container digest are recorded in `upstream.json` and `build-info.json`.

Changes: apply `patches/single-thread-emscripten.patch` to `libdjvu/GThreads.cpp` so `GThread::create()` executes synchronously under non-pthread Emscripten inside the dedicated plugin Worker, avoiding `SharedArrayBuffer` requirements; link `libdjvulibre.a` with `djvu_adapter.cpp` (only read-only decoding, outline, page text, and RGBA8 rendering entry points); initial linear memory 16 MiB, maximum 512 MiB, 2 MiB C stack with overflow checks, `emmalloc`, `DYNAMIC_EXECUTION=0`.

Rebuild: run `bash build.sh OUTPUT_DIRECTORY` on a host with Node 24, Docker, and network access. It invokes the pinned Emscripten container and validates the downloaded upstream archive SHA-256. Application builds only verify and copy these reviewed artifacts; they never compile native C++ sources.

The application integrating this GPL-2.0-or-later runtime must comply with GPLv2+ distribution obligations, including corresponding application and runtime source availability (`/source/djvu.html`). Original Apache/MIT and other notices remain applicable to their respective files. Merely moving decoding into a Web Worker does not waive GPL obligations.
