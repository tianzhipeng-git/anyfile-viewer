import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const output = process.argv[2];
const upstream = JSON.parse(await readFile(new URL("./upstream.json", import.meta.url), "utf8"));
const artifacts = {};

async function visit(path = "") {
  const dir = path ? `${output}/${path}` : output;
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const name = path ? `${path}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await visit(name);
    } else if (entry.name !== "build-info.json" && !entry.name.endsWith(".log")) {
      const bytes = await readFile(`${output}/${name}`);
      artifacts[name] = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
  }
}

await visit();
await writeFile(
  `${output}/build-info.json`,
  `${JSON.stringify(
    {
      artifactVersion: upstream.artifactVersion,
      upstream,
      flags: [
        "single-thread-emscripten-patch",
        "no-xmltools",
        "no-desktopfiles",
        "no-jpeg",
        "no-tiff",
        "-O2",
        "-fexceptions",
        "emmalloc",
        "DYNAMIC_EXECUTION=0",
      ],
      stackBytes: 2097152,
      stackOverflowCheck: 2,
      initialMemoryBytes: 16777216,
      maximumMemoryBytes: 536870912,
      artifacts,
    },
    null,
    2,
  )}\n`,
);
