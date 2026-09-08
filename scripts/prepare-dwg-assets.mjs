import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDwgSource } from "./prepare-dwg-source.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "0.14-anyfile.1";
const source = join(root,"third_party/libredwg",version), target = join(root,"public/vendor/libredwg",version);
const info = JSON.parse(await readFile(join(source,"build-info.json"),"utf8"));
if (info.artifactVersion !== version) throw new Error("Unexpected DWG artifact version");
// Verify the whole audited set before replacing the public copy.
for (const [file, expected] of Object.entries(info.artifacts)) {
  if (file.split("/").some(part => part === ".." || !part) || file.startsWith("/")) throw new Error("Invalid artifact path");
  const bytes = await readFile(join(source,file));
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`DWG artifact integrity failed: ${file}`);
}
await rm(target,{recursive:true,force:true});
for (const file of [...Object.keys(info.artifacts),"build-info.json"]) {
  await mkdir(dirname(join(target,file)),{recursive:true});
  await cp(join(source,file),join(target,file));
}
await prepareDwgSource(root,version);
