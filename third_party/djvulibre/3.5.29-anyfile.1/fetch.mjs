import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const upstream = JSON.parse(await readFile(new URL("./upstream.json", import.meta.url), "utf8"));
const output = process.argv[2];
const path = `${output}/djvulibre-source.tar.gz`;

let bytes;
try {
  bytes = await readFile(path);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  execFileSync("curl", ["-fLsS", "--retry", "3", "--max-time", "180", upstream.core.url, "-o", path]);
  bytes = await readFile(path);
}

const actual = createHash("sha256").update(bytes).digest("hex");
if (actual !== upstream.core.sha256) {
  throw new Error(`Integrity mismatch for djvulibre-source.tar.gz: ${actual} !== ${upstream.core.sha256}`);
}
