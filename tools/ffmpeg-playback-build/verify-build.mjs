import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const directory = resolve(process.argv[2]);
const info = JSON.parse(await readFile(join(directory, "build-info.json"), "utf8"));
for (const [name, expected] of Object.entries(info.artifacts)) {
  assert(!name.includes("/") && !name.includes("\\"), "Invalid artifact path");
  const data = await readFile(join(directory, name));
  assert.equal(data.length, expected.bytes, `${name} size changed`);
  assert.equal(createHash("sha256").update(data).digest("hex"), expected.sha256, `${name} hash changed`);
}
for (const [name, expected] of Object.entries(info.adapterSources)) {
  const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), name));
  assert.equal(createHash("sha256").update(source).digest("hex"), expected, `${name} differs from the built adapter`);
}
const config = await readFile(join(directory, "config.h"), "utf8");
for (const feature of ["GPL", "NONFREE", "NETWORK", "ENCODERS", "MUXERS", "AVFILTER", "AVDEVICE", "PROTOCOLS", "PTHREADS"]) {
  assert.match(config, new RegExp(`^#define (?:CONFIG|HAVE)_${feature} 0$`, "m"), `${feature} unexpectedly enabled`);
}
const configuration = await readFile(join(directory, "configure.txt"), "utf8");
assert.match(configuration, /License: LGPL version 2\.1 or later/);
console.log(`Verified ${Object.keys(info.artifacts).length} artifacts and decode-only feature exclusions`);
