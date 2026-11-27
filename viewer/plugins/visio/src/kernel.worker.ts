import { importRuntime } from "@anyfile/runtime-assets";
import { EngineError, openDrawing, pageSvg, type VisioModule } from "./engine";
import type { Request, Response } from "./types";
let engine: VisioModule;
const send = (response: Response) => self.postMessage(response);
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "init") {
      const { default: create } = await importRuntime<{ default(opts: Record<string, unknown>): Promise<VisioModule> }>(`${data.baseUrl}visio.mjs`);
      engine = await create({ locateFile: (name: string) => `${data.baseUrl}${name}`, print: () => {}, printErr: () => {} });
      const response = await fetch(`${data.baseUrl}converters.dat`);
      if (!response.ok) throw new Error("ICU data fetch failed");
      engine.setIcuData(new Uint8Array(await response.arrayBuffer()));
      send({ type: "ready" });
    } else if (data.type === "open") {
      send({ type: "opened", pages: openDrawing(engine, new Uint8Array(data.bytes)) });
    } else {
      send({ type: "page", svg: pageSvg(engine, data.index) });
    }
  } catch (error) {
    send({ type: "error", code: data.type === "init" ? "unsupported-environment" : error instanceof EngineError ? error.code : "invalid-file" });
  }
};
