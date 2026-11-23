import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "1.1.9-anyfile.1";
const source = join(root, "third_party/readstat", version), target = join(root, "public/vendor/readstat", version);
const info = JSON.parse(await readFile(join(source, "build-info.json"), "utf8"));
if (info.artifactVersion !== version) throw new Error("Unexpected ReadStat runtime version");
const required = ["readstat.mjs", "readstat.wasm", "SOURCE.md", "licenses/readstat-MIT.txt", "licenses/zlib.txt", "licenses/emscripten.txt"];
for (const file of required) if (!info.artifacts[file]) throw new Error(`Missing ReadStat asset: ${file}`);
for (const [file, expected] of Object.entries(info.artifacts)) {
  if (file.startsWith("/") || file.split("/").includes("..")) throw new Error("Invalid ReadStat asset path");
  const bytes = await readFile(join(source, file));
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`ReadStat asset integrity failed: ${file}`);
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of [...Object.keys(info.artifacts), "build-info.json"]) { await mkdir(dirname(join(target, file)), { recursive: true }); await cp(join(source, file), join(target, file)); }
