#!/usr/bin/env bash
set -euo pipefail
recipe=$(cd "$(dirname "$0")" && pwd)
output=${1:?Usage: build.sh OUTPUT_DIRECTORY}
mkdir -p "$output"
output=$(cd "$output" && pwd)
image=$(node -p 'require(process.argv[1]).image' "$recipe/upstream.json")
docker run --rm --platform linux/amd64 -v "$recipe:/recipe:ro" -v "$output:/output" "$image" bash /recipe/build-in-container.sh
node "$recipe/write-build-info.mjs" "$output"
