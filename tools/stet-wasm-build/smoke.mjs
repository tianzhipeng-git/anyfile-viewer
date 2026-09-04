import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const artifactRoot = process.argv[2];
if (!artifactRoot) throw new Error("Usage: node smoke.mjs <artifact-directory>");
const runtime = await import(pathToFileURL(join(artifactRoot, "stet_wasm.js")));
await runtime.default({ module_or_path: await readFile(join(artifactRoot, "stet_wasm_bg.wasm")) });
const interpreter = runtime.create_interpreter();
const source = new TextEncoder().encode(`%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 120 80
newpath 10 10 moveto 110 10 lineto 110 70 lineto 10 70 lineto closepath
1 0 0 setrgbcolor fill
showpage
%%EOF
`);
const count = runtime.render(interpreter, source, 150, "smoke.eps");
if (count !== 1) throw new Error(`Expected one EPS page, received ${count}`);
const dimensions = runtime.page_dimensions(interpreter, 0);
const page = runtime.render_viewport(interpreter, 0, 0, 0, dimensions[0], dimensions[1], 240, 160);
if (page.width !== 240 || page.height !== 160 || page.rgba.length !== 240 * 160 * 4) {
  throw new Error("Unexpected EPS smoke render dimensions");
}
page.free();
interpreter.free();
