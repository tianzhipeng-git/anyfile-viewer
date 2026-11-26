import { importRuntime } from "@anyfile/runtime-assets";
import { createStatEngine, EngineError, type ReadAt, type ReadStatModule } from "./engine";
import type { Request, Response } from "./types";

declare const FileReaderSync: { new (): { readAsArrayBuffer(blob: Blob): ArrayBuffer } };
const WINDOW = 1024 * 1024;
let readstat: ReadStatModule | undefined;
let readAt: ReadAt = () => -1;
let engine: ReturnType<typeof createStatEngine> | undefined;

/** Serves the engine's small sequential reads from a 1 MiB window so large files never load whole. */
function blobReader(file: Blob): ReadAt {
  const reader = new FileReaderSync();
  let start = 0;
  let bytes = new Uint8Array();
  return (position, target) => {
    if (position < start || position + target.length > start + bytes.length) {
      start = position;
      bytes = new Uint8Array(reader.readAsArrayBuffer(file.slice(position, position + Math.max(WINDOW, target.length))));
    }
    const chunk = bytes.subarray(position - start, position - start + target.length);
    target.set(chunk);
    return chunk.length;
  };
}

const send = (response: Response) => self.postMessage(response);
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "init") {
      const { default: create } = await importRuntime<{ default(opts: Record<string, unknown>): Promise<ReadStatModule> }>(`${data.baseUrl}readstat.mjs`);
      readstat = await create({ locateFile: (name: string) => `${data.baseUrl}${name}`, readAt: (position: number, target: Uint8Array) => readAt(position, target), print: () => {}, printErr: () => {} });
      send({ id: data.id, type: "ready" });
    } else if (data.type === "open") {
      readAt = blobReader(data.file);
      engine = createStatEngine(readstat!, data.format, data.file.size);
      send({ id: data.id, type: "schema", schema: engine.schema() });
    } else {
      send({ id: data.id, type: "rows", rows: engine!.rows(data.offset, data.limit, data.firstColumn, data.lastColumn) });
    }
  } catch (error) {
    const code = data.type === "init" ? "unsupported-environment" : error instanceof EngineError ? error.code : "invalid-file";
    send({ id: data.id, type: "error", code, message: `ReadStat ${data.type} failed: ${code}` });
  }
};
