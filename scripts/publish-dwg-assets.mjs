import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "0.14-anyfile.1", prefix = `vendor/libredwg/${version}`;
const directory = join(root,"third_party/libredwg",version);
const info = JSON.parse(await readFile(join(directory,"build-info.json"),"utf8"));
for (const file of [...Object.keys(info.artifacts),"build-info.json"]) {
  const bytes = await readFile(join(directory,file));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (file !== "build-info.json" && (hash !== info.artifacts[file].sha256 || bytes.length !== info.artifacts[file].bytes)) throw new Error(`Local integrity failure: ${file}`);
  const response = await fetch(`https://assets.anyfile.top/${prefix}/${file}?audit=${hash}`);
  if (response.ok) {
    const remote = new Uint8Array(await response.arrayBuffer());
    if (createHash("sha256").update(remote).digest("hex") !== hash) throw new Error(`Immutable version already differs: ${file}`);
    console.log(`Verified existing ${file}`); continue;
  }
  if (response.status !== 404) throw new Error(`Remote lookup failed: ${response.status} ${file}`);
  const type = file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".js") || file.endsWith(".mjs") ? "text/javascript" : file.endsWith(".json") ? "application/json" : /\.(gz|tgz)$/.test(file) ? "application/gzip" : "text/plain";
  execFileSync("npx",["--yes","wrangler@4.129.1","r2","object","put",`anyfile-bucket/${prefix}/${file}`,"--remote","--file",join(directory,file),"--content-type",type,"--cache-control","public, max-age=31536000, immutable"],{cwd:root,stdio:"inherit"});
}
