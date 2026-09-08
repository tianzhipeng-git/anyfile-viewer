# Bounded laz-perf runtime

Artifact 0.0.7-anyfile.1 is built from the npm 0.0.7 gitHead, d0d3047e05221421fa0b02b3da4e93797edb2c52 (Apache-2.0):
https://github.com/hobuinc/laz-perf/archive/d0d3047e05221421fa0b02b3da4e93797edb2c52.tar.gz
SHA-256: 3827d5ac477a2e7bdf8a093db79ffee7f93d4b2f50fce19c820830d72d845bde

Unmodified upstream C++ sources are compiled with the adjacent CMakeLists.txt and build.sh. The registry WASM was rejected because its heap can grow to 2 GiB. This build caps it at 256 MiB, starts with 16 MiB, disables dynamic execution and exports a browser Worker ES module. No decoder algorithm patch is applied. Uses Emscripten 3.1.69 (8fe01288bc35668c13316324336ea00195dfb814).

Build: activate Emscripten 3.1.69, then bash build.sh OUTPUT_DIRECTORY. Docker: use emscripten/emsdk@sha256:9d6522879357a363ada61862481cc12c5f772d5e9738b8addf95d38490cdc6ea with --platform linux/amd64, mount this recipe and the output directory, run bash /recipe/build.sh /out. The reviewed artifact is the Linux/amd64 Docker build. Two independent Docker builds produced identical JS and WASM hashes. Source assertion paths are normalized with -ffile-prefix-map; BINARYEN_CORES=1 fixes optimizer scheduling. A native macOS arm64 comparison had an equivalent-size but different exception-region layout, so cross-host byte identity is not claimed.
