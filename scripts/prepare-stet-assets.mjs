import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "0.8.1-anyfile.1";
const sourceRoot = join(projectRoot, "third_party/stet-wasm", version);
const targetRoot = join(projectRoot, "public/vendor/stet", version);
const buildInfo = JSON.parse(await readFile(join(sourceRoot, "build-info.json"), "utf8"));
if (buildInfo.artifactVersion !== version) throw new Error(`Unexpected stet artifact version: ${buildInfo.artifactVersion}`);

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });
for (const [fileName, expected] of Object.entries(buildInfo.artifacts)) {
  const source = join(sourceRoot, fileName);
  const bytes = await readFile(source);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error(`stet artifact integrity check failed: ${fileName}`);
  }
  await cp(source, join(targetRoot, fileName));
}
await cp(join(sourceRoot, "build-info.json"), join(targetRoot, "build-info.json"));
