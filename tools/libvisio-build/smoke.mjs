import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const runtime = resolve(process.argv[2]);
const fixtures = resolve(process.argv[3]);
const { default: create } = await import(pathToFileURL(join(runtime, "visio.mjs")));
const engine = await create();
engine.setIcuData(await readFile(join(runtime, "converters.dat")));
assert.equal(engine.openVisio(new Uint8Array([1, 2, 3])), 0);
let files = 0, pages = 0;
for (const name of (await readdir(fixtures)).filter((name) => /\.(vsd|vsdx)$/i.test(name))) {
  const count = engine.openVisio(await readFile(join(fixtures, name)));
  assert.ok(count > 0, name);
  for (let index = 0; index < count; index++) {
    const svg = engine.pageSvg(index);
    assert.match(svg, /<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/, name);
    if (!["recursion-cycle.vsdx", "tab-short-prefix.vsdx"].includes(name)) assert.match(svg, /(?:path|rect|ellipse|text|image|polyline|polygon)/, name);
  }
  assert.equal(engine.pageSvg(count), "");
  files++; pages += count;
}
assert.ok(files > 1);
console.log(`Visio runtime smoke: ${files} drawings, ${pages} pages; invalid input rejected.`);
