// @vitest-environment node
import { expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { convertDrawing } from "./geometry";
const files: string[] = JSON.parse(process.env.DWG_TEST_FILES || "[]");
it.skipIf(!files.length)("decodes real DWGs with the production 64 MiB runtime and geometry adapter", async () => {
  const url = pathToFileURL(resolve("../../../third_party/libredwg/0.14-anyfile.1/dist/libredwg-web.js")).href;
  const api = await import(/* @vite-ignore */ url);
  const runtime = await api.createModule();
  expect(runtime.HEAPU8.byteLength).toBe(64*1024*1024);
  const library = api.LibreDwg.createByWasmInstance(runtime);
  const metrics = [];
  for (const file of files) {
    runtime.FS.writeFile("input.dwg",await readFile(file));
    const parsed = runtime.dwg_read_file("input.dwg");runtime.FS.unlink("input.dwg");
    expect(parsed.error).toBeLessThan(128);
    try {
      const {database} = library.convertEx(parsed.data);
      const result = convertDrawing(database);
      expect(result.vertexCount).toBeGreaterThan(0);
      expect(result.batches.every(b => b.positions.every(Number.isFinite))).toBe(true);
      metrics.push({name:file.split("/").pop(),parserWarnings:parsed.error,heapBytes:runtime.HEAPU8.byteLength,entities:result.entityCount,vertices:result.vertexCount,texts:result.texts.length,warnings:result.warnings});
    } finally {library.dwg_free(parsed.data);}
  }
  if(process.env.DWG_TEST_REPORT) await writeFile(process.env.DWG_TEST_REPORT,JSON.stringify(metrics,null,2)+"\n");
},60_000);
