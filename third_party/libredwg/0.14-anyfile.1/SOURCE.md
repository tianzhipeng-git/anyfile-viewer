# LibreDWG browser runtime 0.14-anyfile.1

Core: GNU LibreDWG 0.14, GPL-3.0-or-later. JavaScript/Embind bindings: mlightcad/libredwg-web 0.7.10, GPL-3.0. See COPYING and the included corresponding-source archives. Exact source hashes and the Emscripten 4.0.10 container digest are in upstream.json / build-info.json.

Changes: replace the bindings fork's decoder with official LibreDWG 0.14; compile a read-only release kernel without debug, DXF/JSON export or writing; initial linear memory 64 MiB, maximum 512 MiB, explicit 5 MiB C stack with overflow checks, emmalloc, no dynamic execution. JavaScript wrapper is copied unchanged from the verified npm tarball; both its original TypeScript/Embind source and the tarball are included. Generated JS glue and WASM are rebuilt from source, not patched binaries.

Rebuild: run `bash build.sh OUTPUT_DIRECTORY` on a host with Node 24, Docker and network access. It invokes the exact container and validates the downloaded input archives. The full recipe is included here. Application builds only verify and copy these reviewed artifacts; they never compile the C/C++ kernel.

The application integrating this GPL runtime must be distributed in compliance with GPLv3, including corresponding source. The DWG viewer links to the generated application source bundle and these runtime sources. Original Apache/MIT and other notices remain applicable to their respective files. Merely moving parsing into a Worker does not remove GPL distribution requirements.
