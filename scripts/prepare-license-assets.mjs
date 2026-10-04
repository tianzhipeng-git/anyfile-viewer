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

const dicomLicenseTarget = join(root, "public/vendor/licenses/dicom-parser/1.8.21");
await mkdir(dicomLicenseTarget, { recursive: true });
await cp(join(root, "licenses/dicom-parser/1.8.21/LICENSE"), join(dicomLicenseTarget, "LICENSE"));

const skpLicenseTarget = join(root, "public/vendor/licenses/openskp/1.3.0");
await mkdir(skpLicenseTarget, { recursive: true });
await cp(join(root, "licenses/openskp/1.3.0/LICENSE"), join(skpLicenseTarget, "LICENSE"));

const linkedomLicenseTarget = join(root, "public/vendor/licenses/linkedom/0.18.13");
await mkdir(linkedomLicenseTarget, { recursive: true });
await cp(join(root, "viewer/plugins/mesh-3d/node_modules/linkedom/LICENSE"), join(linkedomLicenseTarget, "LICENSE"));
