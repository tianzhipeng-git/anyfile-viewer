import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "1.32.0";
const source = join(root, "viewer/plugins/duckdb/node_modules/@duckdb/duckdb-wasm");
const target = join(root, "public/vendor/duckdb", version);

const info = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
if (info.version !== version) {
  throw new Error(`Unexpected @duckdb/duckdb-wasm version: expected ${version}, got ${info.version}`);
}

await mkdir(target, { recursive: true });
for (const file of [
  "duckdb-mvp.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-eh.wasm",
  "duckdb-browser-eh.worker.js",
]) {
  await cp(join(source, "dist", file), join(target, file));
}
