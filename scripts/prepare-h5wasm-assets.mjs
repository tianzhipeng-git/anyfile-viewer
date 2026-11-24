import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "0.10.3";
const source = join(root, "viewer/plugins/scientific-data/node_modules/h5wasm");
const target = join(root, "public/vendor/h5wasm", version);

const info = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
if (info.version !== version) {
  throw new Error(`Unexpected h5wasm version: expected ${version}, got ${info.version}`);
}

await mkdir(target, { recursive: true });
await cp(join(source, "dist/esm/hdf5_hl.js"), join(target, "hdf5_hl.js"));
await cp(join(source, "dist/esm/hdf5_util.js"), join(target, "hdf5_util.js"));
await cp(join(source, "LICENSE.txt"), join(target, "LICENSE.txt"));
