import type { DwgDatabase } from "@mlightcad/libredwg-web";
import { convertDrawing } from "./geometry";
import { dwgSignatures } from "./probe";
import { INPUT_LIMIT, type Request, type Response } from "./types";

type Runtime = { FS: { writeFile(path: string, bytes: Uint8Array): void; unlink(path: string): void }; HEAPU8: Uint8Array;
  dwg_read_file(path: string): { data: number; error: number } };
type Library = { convertEx(pointer: number): { database: DwgDatabase; stats: { unknownEntityCount: number } }; dwg_free(pointer: number): void };
let runtime: Runtime, library: Library;
const send = (message: Response, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "init") {
      const api = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ data.runtimeUrl);
      runtime = await api.createModule();
      library = api.LibreDwg.createByWasmInstance(runtime);
      send({ type: "ready" }); return;
    }
    if (data.bytes.byteLength > INPUT_LIMIT) throw new RangeError();
    if (data.bytes.byteLength < 128 || !dwgSignatures.has(new TextDecoder().decode(new Uint8Array(data.bytes, 0, 6)))) throw new Error("Invalid header");
    runtime.FS.writeFile("input.dwg", new Uint8Array(data.bytes));
    let parsed;
    try { parsed = runtime.dwg_read_file("input.dwg"); }
    finally { runtime.FS.unlink("input.dwg"); }
    // Fatal graphs may be incomplete: the main thread terminates this worker instead of walking/freeing them.
    if (parsed.error & 8192) throw new RangeError();
    if (!parsed.data || parsed.error >= 128) throw new Error("Invalid drawing");
    try {
      const { database, stats } = library.convertEx(parsed.data);
      const result = convertDrawing(database);
      result.parserWarnings = parsed.error;
      if (stats.unknownEntityCount) result.warnings["parser-entities"] = stats.unknownEntityCount;
      result.heapBytes = runtime.HEAPU8.byteLength;
      send({ type: "opened", result }, result.batches.map(batch => batch.positions.buffer as ArrayBuffer));
    } finally { library.dwg_free(parsed.data); }
  } catch (error) {
    send({ type: "error", code: data.type === "init" ? "unsupported-environment" : error instanceof RangeError ? "resource-limit" : "invalid-file" });
  }
};
