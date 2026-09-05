import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const recipe = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2]);
const upstream = JSON.parse(await readFile(join(recipe, "upstream.json"), "utf8"));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const artifacts = {};
for (const name of ["ffmpeg-playback.js", "ffmpeg-playback.wasm", "ffmpeg-playback.worker.js", "LICENSE.FFmpeg", "SOURCE.md", "configure.txt", "configure-flags.txt", "config.mak", "config.h"]) {
  const data = await readFile(join(output, name));
  artifacts[name] = { bytes: data.length, gzipBytes: gzipSync(data).length, sha256: sha256(data) };
}
const sources = {};
for (const name of ["bridge.c", "bridge.h", "output.c", "seek.c", "worker.js", "build-in-container.sh", "link-in-container.sh", "upstream.json"]) sources[name] = sha256(await readFile(join(recipe, name)));
const relinkInputs = {};
for (const name of ["source.tar.xz", "avconfig.h", "libavformat.a", "libavcodec.a", "libavutil.a", "libswscale.a", "libswresample.a"]) {
  relinkInputs[name] = sha256(await readFile(join(output, "relink", name)));
}
let adapterBaseRevision = null, adapterWorktreeDirty = null;
try {
  adapterBaseRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: recipe, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  adapterWorktreeDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "."], { cwd: recipe, encoding: "utf8" }).trim());
} catch { /* Standalone source distributions have no Git metadata; hashes remain authoritative. */ }
const info = {
  artifactVersion: upstream.artifactVersion,
  status: "experimental-spike-not-for-product-distribution",
  upstream,
  adapterBaseRevision,
  adapterSources: sources,
  adapterWorktreeDirty,
  linkRecipe: (await readFile(join(recipe, "link-in-container.sh"), "utf8")).split("emcc ")[1],
  relinkInputs,
  configureFlags: (await readFile(join(output, "configure-flags.txt"), "utf8")).trim().split("\n"),
  // The full link invocation is covered by the hashed build recipe.
  limits: { wasmBytes: 268435456, pixels: 2073600, tracks: 8, readBytesPerCommand: 33554432, packetStepsPerNext: 8192 },
  artifacts,
};
await writeFile(join(output, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(JSON.stringify(artifacts, null, 2));
