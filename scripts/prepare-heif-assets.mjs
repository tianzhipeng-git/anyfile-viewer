import { createHash } from "node:crypto";
import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "1.23.2-anyfile.1";
const sourceRoot = join(projectRoot, "third_party/heif-wasm", version);
const targetRoot = join(projectRoot, "public/vendor/libheif", version);
const buildInfo = JSON.parse(await readFile(join(sourceRoot, "build-info.json"), "utf8"));
if (buildInfo.artifactVersion !== version) throw new Error(`Unexpected HEIF artifact version: ${buildInfo.artifactVersion}`);

await mkdir(targetRoot, { recursive: true });
for (const [fileName, expected] of Object.entries(buildInfo.artifacts)) {
  const source = join(sourceRoot, fileName);
  const bytes = await readFile(source);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error(`HEIF artifact integrity check failed: ${fileName}`);
  }
  await cp(source, join(targetRoot, fileName));
}
await cp(join(sourceRoot, "build-info.json"), join(targetRoot, "build-info.json"));
