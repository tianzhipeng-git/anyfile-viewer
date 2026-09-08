import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const info = JSON.parse(await readFile(new URL("../third_party/libredwg/0.14-anyfile.1/build-info.json",import.meta.url),"utf8"));
const base = "https://assets.anyfile.top/vendor/libredwg/0.14-anyfile.1/";
for (const [name, expected] of Object.entries(info.artifacts)) {
  const response = await fetch(base+name,{headers:{Origin:"https://www.anyfile.top"}});
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`${name}: integrity mismatch`);
  if (name.endsWith(".js") || name.endsWith(".wasm")) {
    const type = response.headers.get("content-type") || "";
    if (!type.includes(name.endsWith(".wasm") ? "application/wasm" : "javascript")) throw new Error(`${name}: MIME ${type}`);
    if (!["*","https://www.anyfile.top"].includes(response.headers.get("access-control-allow-origin"))) throw new Error(`${name}: CORS unavailable`);
    if (!response.headers.get("cache-control")?.includes("immutable")) throw new Error(`${name}: immutable cache missing`);
  }
  console.log(`${name}: SHA-256 OK`);
}
