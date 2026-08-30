import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const files = (await readdir(".")).filter((name) => !name.endsWith(".mjs") && name !== "generate.sh" && name !== "manifest.sha256").sort();
const lines = [];
for (const name of files) {
  const bytes = await readFile(name);
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await writeFile("manifest.sha256", `${lines.join("\n")}\n`);
