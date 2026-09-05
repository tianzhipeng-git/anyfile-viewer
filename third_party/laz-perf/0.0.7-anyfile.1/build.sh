#!/usr/bin/env bash
set -euo pipefail
export BINARYEN_CORES=1
recipe=$(cd "$(dirname "$0")" && pwd)
output=${1:?Usage: build.sh OUTPUT_DIRECTORY (with emsdk 3.1.69 activated)}
mkdir -p "$output"
output=$(cd "$output" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
emcc --version | head -n 1 | grep -F '3.1.69'
curl --fail --location --retry 3 https://github.com/hobuinc/laz-perf/archive/d0d3047e05221421fa0b02b3da4e93797edb2c52.tar.gz -o "$work/source.tar.gz"
python3 - "$work/source.tar.gz" <<'PY'
import hashlib,sys
assert hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest() == '3827d5ac477a2e7bdf8a093db79ffee7f93d4b2f50fce19c820830d72d845bde'
PY
mkdir "$work/source"
tar -xzf "$work/source.tar.gz" --strip-components=1 -C "$work/source"
emcmake cmake -S "$recipe" -B "$work/build" -DLAZPERF_SOURCE="$work/source"
cmake --build "$work/build" -j "${BUILD_JOBS:-4}"
cp "$work/build/laz-perf.js" "$work/build/laz-perf.wasm" "$output/"
