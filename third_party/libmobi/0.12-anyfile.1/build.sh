#!/usr/bin/env bash
set -euo pipefail
# Activate Emscripten 3.1.69 before invoking. No native compilation in application builds.
export BINARYEN_CORES=1
recipe=$(cd "$(dirname "$0")" && pwd)
output=${1:?Usage: build.sh OUTPUT_DIRECTORY}
mkdir -p "$output"
output=$(cd "$output" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
emcc --version | head -n 1 | grep -F '3.1.69'
python3 "$recipe/fetch.py" "$work"
mobi=$work/libmobi/libmobi-906274205c11944b628da1c553b255acb1af7c55
emcmake cmake -S "$mobi" -B "$work/mobi-build" -DBUILD_SHARED_LIBS=OFF -DUSE_ENCRYPTION=OFF -DUSE_LIBXML2=OFF -DUSE_ZLIB=OFF -DCMAKE_BUILD_TYPE=MinSizeRel
cmake --build "$work/mobi-build" --target mobi -j 6
mkdir -p "$work/output-mobi" "$work/output-archive"
emcc "$recipe/mobi.c" -I"$mobi/src" "$work/mobi-build/src/libmobi.a" "$mobi/src/miniz.c" -Oz -o "$work/output-mobi/mobi.js" -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 -sINITIAL_MEMORY=16777216 -sSTACK_SIZE=1048576 -sABORTING_MALLOC=0 -sFILESYSTEM=1 -sDYNAMIC_EXECUTION=0 -sEXPORTED_RUNTIME_METHODS='["UTF8ToString"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_open_book","_close_book","_part_count","_part_name","_part_size","_part_data","_part_type","_book_title"]'
xz=$work/xz/xz-5.8.3
emcmake cmake -S "$xz" -B "$work/xz-build" -DCMAKE_BUILD_TYPE=MinSizeRel -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF -DXZ_TOOL_XZ=OFF -DXZ_TOOL_XZDEC=OFF -DXZ_TOOL_LZMADEC=OFF -DXZ_TOOL_LZMAINFO=OFF -DXZ_TOOL_SCRIPTS=OFF -DXZ_NLS=OFF -DXZ_THREADS=no -DCMAKE_INSTALL_PREFIX="$work/prefix"
cmake --build "$work/xz-build" -j 6
cmake --install "$work/xz-build"
archive=$work/libarchive/libarchive-3.8.9
emcmake cmake -S "$archive" -B "$work/archive-build" -DCMAKE_BUILD_TYPE=MinSizeRel -DBUILD_SHARED_LIBS=OFF -DENABLE_OPENSSL=OFF -DENABLE_LIBB2=OFF -DENABLE_LZ4=OFF -DENABLE_ZSTD=OFF -DENABLE_ZLIB=OFF -DENABLE_BZip2=OFF -DENABLE_LIBXML2=OFF -DENABLE_EXPAT=OFF -DENABLE_PCREPOSIX=OFF -DENABLE_PCRE2POSIX=OFF -DENABLE_TAR=OFF -DENABLE_CPIO=OFF -DENABLE_CAT=OFF -DENABLE_UNZIP=OFF -DENABLE_TEST=OFF -DENABLE_ACL=OFF -DENABLE_XATTR=OFF -DENABLE_ICONV=OFF -DLIBLZMA_INCLUDE_DIR="$work/prefix/include" -DLIBLZMA_LIBRARY="$work/prefix/lib/liblzma.a"
cmake --build "$work/archive-build" --target archive_static -j 6
emcc "$recipe/archive.c" -I"$archive/libarchive" "$work/archive-build/libarchive/libarchive.a" "$work/prefix/lib/liblzma.a" -Oz -o "$work/output-archive/comic-archive.js" -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 -sINITIAL_MEMORY=16777216 -sSTACK_SIZE=1048576 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDYNAMIC_EXECUTION=0 -sEXPORTED_RUNTIME_METHODS='["UTF8ToString"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_open_archive","_close_archive","_next_entry","_entry_name","_entry_size","_entry_kind","_entry_link","_entry_encrypted","_read_entry","_archive_error"]'

cp -R "$work/output-mobi" "$work/output-archive" "$output/"
