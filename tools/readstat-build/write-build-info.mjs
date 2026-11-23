import { createHash } from "node:crypto";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const recipe = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
const upstream = JSON.parse(await readFile(join(recipe, "upstream.json"), "utf8"));
await cp(join(recipe, "SOURCE.md"), join(output, "SOURCE.md"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const artifacts = {};
for (const file of (await readdir(output, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile())) {
  const name = join(file.parentPath, file.name).slice(output.length + 1);
  if (name === "build-info.json") continue;
  const bytes = await readFile(join(output, name));
  artifacts[name] = { bytes: bytes.length, sha256: sha256(bytes) };
}
const recipeHashes = {};
for (const file of ["CMakeLists.txt", "adapter.c", "build-in-container.sh"]) recipeHashes[file] = sha256(await readFile(join(recipe, file)));
const options = { optimization: "O2", zlib: true, memoryMaximum: 268435456, stackSize: 1048576, filesystem: false, networking: false, outputBytes: 50331648, cellText: 4096, labelEntries: 200000 };
await writeFile(join(output, "build-info.json"), JSON.stringify({ ...upstream, adapterRevision: 1, recipeHashes, options, artifacts }, null, 2) + "\n");
