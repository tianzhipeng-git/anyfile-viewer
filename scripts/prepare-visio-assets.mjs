import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "0.1.11-anyfile.1";
const source = join(root, "third_party/libvisio", version), target = join(root, "public/vendor/libvisio", version);
const info = JSON.parse(await readFile(join(source, "build-info.json"), "utf8"));
if (info.artifactVersion !== version) throw new Error("Unexpected Visio runtime version");
const required = ["visio.mjs", "visio.wasm", "converters.dat", "SOURCE.md", "sources/libvisio.tar.xz", "sources/librevenge.tar.xz", ...["libvisio-MPL-2.0", "librevenge-MPL-2.0", "libxml2", "icu", "boost", "zlib", "emscripten"].map((name) => `licenses/${name}.txt`)];
for (const file of required) if (!info.artifacts[file]) throw new Error(`Missing Visio asset: ${file}`);
for (const [file, expected] of Object.entries(info.artifacts)) {
  if (file.startsWith("/") || file.split("/").includes("..")) throw new Error("Invalid Visio asset path");
  const bytes = await readFile(join(source, file));
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`Visio asset integrity failed: ${file}`);
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of [...Object.keys(info.artifacts), "build-info.json"]) { await mkdir(dirname(join(target, file)), { recursive: true }); await cp(join(source, file), join(target, file)); }
