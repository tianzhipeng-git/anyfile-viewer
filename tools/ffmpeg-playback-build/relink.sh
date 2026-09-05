#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
output=$(cd "${1:?Pass a completed experimental build directory}" && pwd)
node --input-type=module - "$output" <<'JS'
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const directory = process.argv[2];
const info = JSON.parse(await readFile(`${directory}/build-info.json`, "utf8"));
const hash = data => createHash("sha256").update(data).digest("hex");
for (const name of ["upstream.json", "build-in-container.sh"]) {
  assert.equal(hash(await readFile(`tools/ffmpeg-playback-build/${name}`)), info.adapterSources[name], `${name} changed: run a full build`);
}
for (const [name, expected] of Object.entries(info.relinkInputs)) {
  assert.equal(hash(await readFile(`${directory}/relink/${name}`)), expected, `${name} changed: run a full build`);
}
JS
image=$(node -p 'JSON.parse(require("fs").readFileSync("tools/ffmpeg-playback-build/upstream.json")).image')
docker run --rm --platform linux/amd64 -v "$root:/work:ro" -v "$output:/output" "$image" bash -c '
  set -euo pipefail
  recipe=/work/tools/ffmpeg-playback-build
  readarray -t upstream < <(node -e '\''const u=require(process.argv[1]); console.log([u.version,u.sha256].join("\n"))'\'' "$recipe/upstream.json")
  echo "${upstream[1]}  /output/relink/source.tar.xz" | sha256sum --check
  temporary=$(mktemp -d)
  trap '\''rm -rf "$temporary"'\'' EXIT
  tar -xf /output/relink/source.tar.xz -C "$temporary"
  source="$temporary/ffmpeg-${upstream[0]}"
  cp /output/relink/avconfig.h "$source/libavutil/"
  bash "$recipe/link-in-container.sh" "$source" /output/relink /output
  cp "$recipe/worker.js" /output/ffmpeg-playback.worker.js
'
node tools/ffmpeg-playback-build/write-build-info.mjs "$output"
