#!/usr/bin/env bash
set -euo pipefail
recipe=$(cd "$(dirname "$0")" && pwd)
output=${1:?Usage: build.sh OUTPUT_DIRECTORY (with emsdk 3.1.69 activated)}
mkdir -p "$output"
output=$(cd "$output" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fetch() {
  curl --fail --location --retry 3 "$1" -o "$work/$2.tar.gz"
  python3 - "$work/$2.tar.gz" "$3" <<'PY'
import hashlib,sys
assert hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()==sys.argv[2], 'Source archive integrity failure'
PY
  mkdir "$work/$2"
  tar -xzf "$work/$2.tar.gz" --strip-components=1 -C "$work/$2"
}
emcc --version | head -n 1 | grep -F '3.1.69'
fetch https://github.com/kovacsv/occt-import-js/archive/c2148e54b456b571238d35cac037d304053d64b2.tar.gz source 2bd3799b2ac56cbf3f0df6300a51c8890e137bd001462702b356f621e33ff192
fetch https://github.com/Open-Cascade-SAS/OCCT/archive/d2abb6d844231cb8f29be6894440874a4700e4a5.tar.gz occt 2715d89a1bc44dfd34dab88f729c445ea93f6b57d6539b0c89614a80ae144a6c
rmdir "$work/source/occt"
mv "$work/occt" "$work/source/occt"
python3 "$recipe/patch-source.py" "$work/source"
emcmake cmake -S "$work/source" -B "$work/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$work/build" -j "${BUILD_JOBS:-6}"
cp "$work/build/Release/occt-import-js.js" "$work/build/Release/occt-import-js.wasm" "$output/"
