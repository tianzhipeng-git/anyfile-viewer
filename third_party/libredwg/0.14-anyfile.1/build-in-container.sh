#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export SOURCE_DATE_EPOCH=1787270400
apt-get update -qq
apt-get install -y --no-install-recommends pkg-config=0.29.2-1ubuntu3
node /recipe/fetch.mjs /output
mkdir "$work/core" "$work/bindings" "$work/npm"
tar -xzf /output/libredwg-source.tar.gz --strip-components=1 -C "$work/core"
tar -xzf /output/bindings-source.tar.gz --strip-components=1 -C "$work/bindings"
tar -xzf /output/bindings-npm.tgz --strip-components=1 -C "$work/npm"
cd "$work/core"
emconfigure ./configure CC=emcc CXX=em++ CFLAGS="-O2 -sUSE_ZLIB=1 -DNDEBUG" \
  --enable-release --disable-debug --disable-docs --disable-write --disable-dxf --disable-json \
  --disable-python --disable-bindings --disable-shared > /output/configure.log 2>&1
emmake make -j4 > /output/compile.log 2>&1
mkdir -p /output/wasm /output/dist
em++ "$work/bindings"/bindings/javascript/embind/*.cpp src/*.o \
  -O2 -lembind -std=c++17 -Isrc -Iinclude -include src/config.h -DDISABLE_DXF \
  -sUSE_ZLIB=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=536870912 \
  -sSTACK_SIZE=5242880 -sSTACK_OVERFLOW_CHECK=2 -sMALLOC=emmalloc -sABORTING_MALLOC=0 -sDYNAMIC_EXECUTION=0 -sEXPORT_ES6=1 -sMODULARIZE=1 \
  --emit-symbol-map -sENVIRONMENT=worker,node -sEXPORTED_RUNTIME_METHODS=FS,ENV,HEAPU8 \
  -o /output/wasm/libredwg-web.js > /output/link.log 2>&1
cp "$work/npm/dist/libredwg-web.js" /output/dist/
cp COPYING /output/COPYING
cp /recipe/{build.sh,build-in-container.sh,fetch.mjs,upstream.json,write-build-info.mjs} /output/
cp /recipe/SOURCE.md /output/SOURCE.md
