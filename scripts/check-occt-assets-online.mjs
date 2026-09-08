import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// Release verification is intentionally separate from the offline build gate.
const version = "0.0.23-anyfile.1";
const root = new URL(`../third_party/occt-import-js/${version}/`, import.meta.url);
const manifestBytes = await readFile(new URL("build-info.json", root));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.artifactVersion, version);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const artifacts = {
  ...manifest.artifacts,
  "build-info.json": { bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
};
const report = [];
for (const [name, expected] of Object.entries(artifacts)) {
  const url = `https://assets.anyfile.top/vendor/occt-import-js/${version}/${name}`;
  const cache = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      headers: { Origin: "https://anyfile.top" },
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, url);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, expected.bytes, `${name}: length`);
    assert.equal(sha256(bytes), expected.sha256, `${name}: SHA-256`);
    const headers = response.headers;
    assert.ok(["*", "https://anyfile.top"].includes(headers.get("access-control-allow-origin")), `${name}: CORS`);
    assert.equal(headers.get("cross-origin-resource-policy"), "cross-origin", `${name}: CORP`);
    assert.match(headers.get("cache-control") ?? "", /max-age=31536000/, `${name}: cache TTL`);
    assert.match(headers.get("cache-control") ?? "", /immutable/, `${name}: immutable`);
    const mime = name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".js") ? "application/javascript" : name.endsWith(".json") ? "application/json" : "text/plain";
    assert.equal(headers.get("content-type")?.split(";")[0], mime, `${name}: MIME`);
    cache.push(headers.get("cf-cache-status"));
  }
  assert.equal(cache.at(-1), "HIT", `${name}: repeat GET cache`);
  report.push({ name, ...expected, cache });
}
console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), version, report }, null, 2));
