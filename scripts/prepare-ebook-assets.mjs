import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
for (const [dependency, version] of [["libmobi", "0.12-anyfile.1"], ["comic-archive", "3.8.9-anyfile.1"]]) {
  const source = resolve("third_party", dependency, version), target = resolve("public/vendor", dependency, version);
  const info = JSON.parse(await readFile(`${source}/build-info.json`, "utf8"));
  if (info.artifactVersion !== version) throw new Error("Ebook artifact version mismatch");
  // Verify all trusted inputs before replacing generated files.
  for (const [name, expected] of Object.entries(info.artifacts)) {
    const bytes = await readFile(`${source}/${name}`);
    if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`Ebook artifact integrity: ${name}`);
  }
  await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true });
  for (const name of [...Object.keys(info.artifacts), "build-info.json"]) {
    const destination = name.endsWith("-source.tar.gz") ? resolve("public/vendor/licenses", dependency, version) : target;
    await mkdir(destination, { recursive: true });
    await cp(`${source}/${name}`, `${destination}/${name}`);
  }
}
