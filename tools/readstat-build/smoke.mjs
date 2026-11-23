import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const runtime = resolve(process.argv[2]);
const fixtures = resolve(process.argv[3]);
const formats = { ".sav": 0, ".zsav": 0, ".por": 1, ".dta": 2, ".sas7bdat": 3, ".xpt": 4 };
let bytes = new Uint8Array();
const engine = await (await import(pathToFileURL(join(runtime, "readstat.mjs")))).default({
  readAt(position, target) { const chunk = bytes.subarray(position, position + target.length); target.set(chunk); return chunk.length; },
});
const output = () => JSON.parse(new TextDecoder().decode(engine.HEAPU8.subarray(engine._rs_output(), engine._rs_output() + engine._rs_output_length())));
bytes = new Uint8Array([1, 2, 3]);
for (const format of Object.values(formats)) assert.notEqual(engine._rs_schema(format, bytes.length), 0);
let files = 0;
for (const name of (await readdir(fixtures)).filter((file) => extname(file).toLowerCase() in formats && !/invalid|truncated|corrupt|disguised/.test(file))) {
  bytes = new Uint8Array(await readFile(join(fixtures, name)));
  const format = formats[extname(name).toLowerCase()];
  assert.equal(engine._rs_schema(format, bytes.length), 0, name);
  const schema = output();
  assert.ok(schema.variables.length > 0, name);
  assert.equal(engine._rs_rows(format, bytes.length, 0, 5, 0, schema.variables.length), 0, name);
  const rows = output();
  assert.ok(schema.meta.rows === 0 ? rows.length === 0 : rows[0].length === schema.variables.length, name);
  console.log(`${name}: ${schema.variables.length} variables, rows=${schema.meta.rows}, labels=${schema.labels.length}, first=${JSON.stringify(rows[0] ?? []).slice(0, 120)}`);
  files++;
}
assert.ok(files > 0);
console.log(`ReadStat runtime smoke: ${files} files; invalid input rejected.`);
