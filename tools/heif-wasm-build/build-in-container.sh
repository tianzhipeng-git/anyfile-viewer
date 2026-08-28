#!/usr/bin/env bash
set -euo pipefail

artifact_version=1.23.2-anyfile.1
libheif_version=1.23.2
libde265_version=1.1.1
libheif_sha=1405ed070421459b569ff49deab109b7f1a30a447e72a9b20a4154f774634a44
libde265_sha=5b4fac677018e6074196e8f9889f3e4a5310e46afbf22a893f620d4e24d3510e
build_root=$(mktemp -d)
output=/work/third_party/heif-wasm/$artifact_version

curl -L --fail --silent --show-error "https://github.com/strukturag/libheif/archive/refs/tags/v${libheif_version}.tar.gz" -o "$build_root/libheif.tar.gz"
curl -L --fail --silent --show-error "https://github.com/strukturag/libde265/archive/refs/tags/v${libde265_version}.tar.gz" -o "$build_root/libde265.tar.gz"
echo "$libheif_sha  $build_root/libheif.tar.gz" | sha256sum --check
echo "$libde265_sha  $build_root/libde265.tar.gz" | sha256sum --check
tar -xzf "$build_root/libheif.tar.gz" -C "$build_root"
tar -xzf "$build_root/libde265.tar.gz" -C "$build_root"

emcmake cmake -S "$build_root/libde265-$libde265_version" -B "$build_root/libde265-build" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DENABLE_DECODER=ON \
  -DCMAKE_INSTALL_PREFIX="$build_root/libde265-install" \
  -DENABLE_ENCODER=OFF -DENABLE_SDL=OFF -DENABLE_SIMD=OFF \
  -DENABLE_SHERLOCK265=OFF -DENABLE_INTERNAL_DEVELOPMENT_TOOLS=OFF
cmake --build "$build_root/libde265-build" --parallel 4
cmake --install "$build_root/libde265-build"

emcmake cmake -S "$build_root/libheif-$libheif_version" -B "$build_root/libheif-build" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF -DWITH_EXAMPLES=OFF \
  -DCMAKE_CXX_FLAGS="-D__EMSCRIPTEN_STANDALONE_WASM__=1" \
  -DENABLE_PLUGIN_LOADING=OFF -DENABLE_MULTITHREADING_SUPPORT=OFF \
  -DWITH_LIBDE265=ON -DWITH_LIBDE265_PLUGIN=OFF \
  -DLIBDE265_INCLUDE_DIR="$build_root/libde265-install/include" \
  -DLIBDE265_LIBRARY="$build_root/libde265-install/lib/libde265.a" \
  -DWITH_X265=OFF -DWITH_KVAZAAR=OFF -DWITH_UVG266=OFF -DWITH_VVDEC=OFF -DWITH_VVENC=OFF \
  -DWITH_X264=OFF -DWITH_OpenH264_DECODER=OFF -DWITH_DAV1D=OFF \
  -DWITH_AOM_DECODER=OFF -DWITH_AOM_ENCODER=OFF -DWITH_SvtEnc=OFF -DWITH_RAV1E=OFF \
  -DWITH_JPEG_DECODER=OFF -DWITH_JPEG_ENCODER=OFF \
  -DWITH_OpenJPEG_DECODER=OFF -DWITH_OpenJPEG_ENCODER=OFF \
  -DWITH_FFMPEG_DECODER=OFF -DWITH_OPENJPH_ENCODER=OFF \
  -DWITH_UNCOMPRESSED_CODEC=OFF -DWITH_WEBCODECS=OFF
cmake --build "$build_root/libheif-build" --parallel 4

em++ /work/tools/heif-wasm-build/adapter.cc \
  "$build_root/libheif-build/libheif/libheif.a" \
  "$build_root/libde265-install/lib/libde265.a" \
  -I"$build_root/libheif-$libheif_version/libheif/api" \
  -I"$build_root/libheif-build" \
  -I"$build_root/libde265-install/include" \
  -lembind -O3 -flto -fexceptions -std=c++20 --no-entry \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createHeifDecoder \
  -sENVIRONMENT=worker -sFILESYSTEM=0 -sDYNAMIC_EXECUTION=0 \
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=536870912 \
  -sASSERTIONS=0 -o "$output/heif-decoder.js"

cp "$build_root/libheif-$libheif_version/COPYING" "$output/LICENSE.libheif"
cp "$build_root/libde265-$libde265_version/COPYING" "$output/LICENSE.libde265"
