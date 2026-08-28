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
