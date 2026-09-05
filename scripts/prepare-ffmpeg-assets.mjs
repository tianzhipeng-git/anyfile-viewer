import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = dirname(dirname(fileURLToPath(import.meta.url))), version = "9.0.1-anyfile.1";
const source = join(root, "third_party/ffmpeg-playback", version), target = join(root, "public/vendor/ffmpeg-playback", version);
const info = JSON.parse(await readFile(join(source, "build-info.json"), "utf8"));
if (info.artifactVersion !== version) throw new Error("FFmpeg version mismatch");
const client = await readFile(join(root, "viewer/ffmpeg-playback/src/client.ts"), "utf8");
if (!client.includes(`FFMPEG_VERSION = "${version}"`)) throw new Error("FFmpeg runtime URL version mismatch");
for (const name of ["ffmpeg-playback.js", "ffmpeg-playback.wasm", "ffmpeg-playback.worker.js", "SOURCE.md", "LICENSE.FFmpeg", "LICENSE.Emscripten", "LICENSE.Adapter", "ffmpeg-source.tar.xz", "relink-materials.tar.gz"]) {
  if (!info.artifacts[name]) throw new Error(`Missing FFmpeg artifact: ${name}`);
}
for (const [name, expected] of Object.entries(info.artifacts)) {
  if (!/^[A-Za-z0-9.-]+$/.test(name)) throw new Error("Invalid FFmpeg artifact path");
  const bytes = await readFile(join(source, name));
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`FFmpeg integrity failure: ${name}`);
  if (name === "ffmpeg-playback.wasm" && gzipSync(bytes).length > 5 * 1024 * 1024) throw new Error("FFmpeg WASM exceeds its reviewed gzip baseline");
}
await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true });
for (const name of [...Object.keys(info.artifacts), "build-info.json"]) await cp(join(source, name), join(target, name));
