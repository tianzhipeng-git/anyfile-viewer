#!/usr/bin/env bash
set -euo pipefail
recipe=/work/tools/ffmpeg-playback-build
readarray -t upstream < <(node -e 'const u=require(process.argv[1]); console.log([u.version,u.url,u.sha256].join("\n"))' "$recipe/upstream.json")
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
curl -fLsS "${upstream[1]}" -o "$build/source.tar.xz"
echo "${upstream[2]}  $build/source.tar.xz" | sha256sum --check
tar -xf "$build/source.tar.xz" -C "$build"
cd "$build/ffmpeg-${upstream[0]}"
# The spike measures the broad decode-only build before choosing a product allowlist.
flags=(--cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm
  --target-os=none --arch=wasm32 --enable-cross-compile --disable-autodetect
  --disable-x86asm --disable-asm --disable-inline-asm --disable-runtime-cpudetect
  --disable-programs --disable-doc --disable-debug --disable-network
  --disable-avdevice --disable-avfilter --disable-encoders --disable-muxers
  --disable-filters --disable-devices --disable-protocols --disable-pthreads
  --disable-w32threads --disable-os2threads --disable-shared --enable-static
  --extra-cflags=-O3 --extra-ldflags=-O3)
./configure "${flags[@]}" > /output/configure.txt
printf '%s\n' "${flags[@]}" > /output/configure-flags.txt
make -j4 > /output/compile.log 2>&1
mkdir -p /output/relink
for lib in libavformat libavcodec libswscale libswresample libavutil; do
  cp "$lib/$lib.a" /output/relink/
done
cp libavutil/avconfig.h /output/relink/
cp "$build/source.tar.xz" /output/relink/
bash "$recipe/link-in-container.sh" "$PWD" /output/relink /output
cp "$recipe/worker.js" /output/ffmpeg-playback.worker.js
cp COPYING.LGPLv2.1 /output/LICENSE.FFmpeg
cp ffbuild/config.mak /output/config.mak
cp config.h /output/config.h
cp "$recipe/SOURCE.md" /output/SOURCE.md
