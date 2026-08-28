#!/usr/bin/env bash
set -euo pipefail

image='emscripten/emsdk@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7'
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
docker run --rm --platform linux/amd64 -v "$repo_root:/work" -w /work "$image" \
  bash tools/heif-wasm-build/build-in-container.sh
node tools/heif-wasm-build/write-build-info.mjs
