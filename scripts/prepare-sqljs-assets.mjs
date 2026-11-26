import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "1.14.2";
const source = join(root, "viewer/plugins/sqlite/node_modules/sql.js");
const target = join(root, "public/vendor/sqljs", version);

const info = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
if (info.version !== version) {
  throw new Error(`Unexpected sql.js version: expected ${version}, got ${info.version}`);
}

await mkdir(target, { recursive: true });
await cp(join(source, "dist/sql-wasm.wasm"), join(target, "sql-wasm.wasm"));
