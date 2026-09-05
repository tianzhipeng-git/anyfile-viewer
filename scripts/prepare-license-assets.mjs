import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(await readFile(join(
  root, "viewer/plugins/non-native-video/node_modules/mediabunny/package.json",
), "utf8"));
const source = join(root, "licenses/mediabunny", version);
const target = join(root, "public/vendor/licenses/mediabunny", version);
await mkdir(target, { recursive: true });
for (const file of ["MPL-2.0.txt", "SOURCE.md"]) {
  await cp(join(source, file), join(target, file));
}
