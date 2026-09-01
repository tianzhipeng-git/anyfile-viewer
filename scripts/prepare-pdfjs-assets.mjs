import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pdfjsRoot = join(projectRoot, "node_modules/pdfjs-dist");
const packageJson = JSON.parse(await readFile(join(pdfjsRoot, "package.json"), "utf8"));
const targetRoot = join(projectRoot, "public/vendor/pdfjs", packageJson.version);

await mkdir(targetRoot, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "iccs"]) {
  await cp(join(pdfjsRoot, directory), join(targetRoot, directory), { recursive: true });
}

const wasmTarget = join(targetRoot, "wasm");
await mkdir(wasmTarget, { recursive: true });
for (const fileName of [
  "jbig2.wasm",
  "jbig2_nowasm_fallback.js",
  "openjpeg.wasm",
  "openjpeg_nowasm_fallback.js",
  "qcms_bg.wasm",
]) {
  await cp(join(pdfjsRoot, "wasm", fileName), join(wasmTarget, fileName));
}

const librawRoot = join(projectRoot, "node_modules/libraw-wasm");
const librawPackage = JSON.parse(await readFile(join(librawRoot, "package.json"), "utf8"));
const librawTarget = join(projectRoot, "public/vendor/libraw", librawPackage.version);
const librawLicenseRoot = join(projectRoot, "licenses/libraw-wasm", librawPackage.version);
await mkdir(librawTarget, { recursive: true });
for (const fileName of ["index.js", "worker.js", "libraw.js", "libraw.wasm"]) {
  await cp(join(librawRoot, "dist", fileName), join(librawTarget, fileName));
}
for (const fileName of [
  "COPYRIGHT.LibRaw",
  "LICENSE.Emscripten",
  "LICENSE.LibRaw-CDDL-1.0",
  "LICENSE.Little-CMS-MIT",
  "LICENSE.libpng",
  "LICENSE.libraw-wasm-ISC",
  "LICENSE.zlib",
  "NOTICE.IJG-libjpeg",
  "SOURCE.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  await cp(join(librawLicenseRoot, fileName), join(librawTarget, fileName));
}
