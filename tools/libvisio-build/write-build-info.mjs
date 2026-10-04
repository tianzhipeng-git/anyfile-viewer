import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const recipe = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
const upstream = JSON.parse(await readFile(join(recipe, "upstream.json"), "utf8"));
await cp(join(recipe, "SOURCE.md"), join(output, "SOURCE.md"));
const artifacts = {};
for (const file of (await readdir(output, { recursive: true, withFileTypes: true })).filter((file) => file.isFile())) {
  const name = join(file.parentPath, file.name).slice(output.length + 1);
  if (name === "build-info.json") continue;
  const bytes = await readFile(join(output, name));
  artifacts[name] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
const recipeHashes = {};
for (const file of ["CMakeLists.txt", "adapter.cpp", "build-in-container.sh", "converters.txt"]) recipeHashes[file] = createHash("sha256").update(await readFile(join(recipe, file))).digest("hex");
await writeFile(join(output, "build-info.json"), JSON.stringify({ ...upstream, adapterRevision: 1, recipeHashes, options: { optimization: "O3", exceptions: true, memoryMaximum: 536870912, filesystem: false, networking: false, pages: 512, outputBytes: 67108864, pageBytes: 16777216 }, artifacts }, null, 2) + "\n");
