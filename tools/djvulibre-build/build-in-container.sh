#!/usr/bin/env bash
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export SOURCE_DATE_EPOCH=1787270400

node /recipe/fetch.mjs /output
tar -xzf /output/djvulibre-source.tar.gz -C "$work"
src="$work/djvulibre-3.5.29"
cd "$src"

patch -p1 < /recipe/patches/single-thread-emscripten.patch

emconfigure ./configure \
  --disable-shared \
  --enable-static \
  --disable-xmltools \
  --disable-desktopfiles \
  --without-jpeg \
  --without-tiff \
  CFLAGS="-O2 -DNDEBUG" \
  CXXFLAGS="-O2 -DNDEBUG -fexceptions" \
  LDFLAGS="-fexceptions" \
  > /output/configure.log 2>&1

emmake make -C libdjvu -j4 PTHREAD_CFLAGS="" PTHREAD_LIBS="" > /output/compile.log 2>&1

em++ /recipe/djvu_adapter.cpp \
  libdjvu/.libs/libdjvulibre.a \
  -O2 -std=c++17 -fexceptions -DNDEBUG \
  -Ilibdjvu -include config.h \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=16777216 \
  -sMAXIMUM_MEMORY=536870912 \
  -sSTACK_SIZE=2097152 \
  -sSTACK_OVERFLOW_CHECK=2 \
  -sMALLOC=emmalloc \
  -sABORTING_MALLOC=0 \
  -sDYNAMIC_EXECUTION=0 \
  -sFILESYSTEM=1 \
  -sEXPORT_ES6=1 \
  -sMODULARIZE=1 \
  -sENVIRONMENT=worker,node \
  -sEXPORTED_RUNTIME_METHODS='["FS","UTF8ToString","HEAPU8","HEAP32"]' \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_djvu_open","_djvu_is_open","_djvu_last_error","_djvu_doc_type","_djvu_page_count","_djvu_page_info","_djvu_outline_json","_djvu_page_text_json","_djvu_render_page","_djvu_close"]' \
  -o /output/djvu.js > /output/link.log 2>&1

cp COPYING /output/COPYING
cp COPYRIGHT /output/COPYRIGHT
mkdir -p /output/patches
cp /recipe/{build.sh,build-in-container.sh,fetch.mjs,upstream.json,write-build-info.mjs,djvu_adapter.cpp,SOURCE.md} /output/
cp /recipe/patches/single-thread-emscripten.patch /output/patches/
