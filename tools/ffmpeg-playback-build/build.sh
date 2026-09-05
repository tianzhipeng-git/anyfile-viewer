#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
image=$(node -p 'JSON.parse(require("fs").readFileSync("tools/ffmpeg-playback-build/upstream.json")).image')
output=${1:-/tmp/anyfile-ffmpeg-build}
mkdir -p "$output"
output=$(cd "$output" && pwd)
docker run --rm --platform linux/amd64 -v "$root:/work:ro" -v "$output:/output" "$image" \
  bash /work/tools/ffmpeg-playback-build/build-in-container.sh
docker run --rm --platform linux/amd64 "$image" cat /emsdk/upstream/emscripten/LICENSE > "$output/LICENSE.Emscripten"
node tools/ffmpeg-playback-build/write-build-info.mjs "$output"
