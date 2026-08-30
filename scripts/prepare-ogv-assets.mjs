import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeConfig = JSON.parse(await readFile(join(
  root,
  "viewer/plugins/non-native-video/ogv-runtime.json",
), "utf8"));
const version = runtimeConfig.version;
const source = join(root, "viewer/plugins/non-native-video/node_modules/ogv/dist");
const target = join(root, "public/vendor/ogv", version);
const assets = [
  ...runtimeConfig.runtimeAssets,
  ...runtimeConfig.licenses.map(({ file }) => file),
];

const packageJson = JSON.parse(await readFile(join(source, "..", "package.json"), "utf8"));
if (packageJson.version !== version) throw new Error(`OGV.js version changed to ${packageJson.version}; update the runtime path.`);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await Promise.all(assets.map((asset) => cp(join(source, asset), join(target, asset))));
