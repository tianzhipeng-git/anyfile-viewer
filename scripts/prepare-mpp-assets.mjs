import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "0.0.0-0483da3-anyfile.1";
const source = join(root, "third_party/mppgo", version), target = join(root, "public/vendor/mppgo", version);
const info = JSON.parse(await readFile(join(source, "build-info.json"), "utf8"));
if (info.artifactVersion !== version) throw new Error("Unexpected MPP runtime version");
for (const file of ["mpp.wasm", "wasm_exec.js", "LICENSE", "NOTICE", "GO-LICENSE", "SOURCE.md"]) {
  const expected = info.artifacts[file];
  const bytes = await readFile(join(source, file));
  if (!expected || bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`MPP asset integrity failed: ${file}`);
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of ["mpp.wasm", "wasm_exec.js", "LICENSE", "NOTICE", "GO-LICENSE", "SOURCE.md", "build-info.json"]) await cp(join(source, file), join(target, file));
