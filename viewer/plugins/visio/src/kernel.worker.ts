import { INPUT_LIMIT, type Request, type Response } from "./types";
type Engine = { setIcuData(bytes: Uint8Array): void; openVisio(bytes: Uint8Array): number; pageSvg(index: number): string };
let engine: Engine;
const send = (response: Response) => self.postMessage(response);
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "init") {
      const { default: create } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${data.baseUrl}visio.mjs`);
      engine = await create({ locateFile: (name: string) => `${data.baseUrl}${name}`, print: () => {}, printErr: () => {} });
      const response = await fetch(`${data.baseUrl}converters.dat`);
      if (!response.ok) throw new Error("ICU data fetch failed");
      engine.setIcuData(new Uint8Array(await response.arrayBuffer()));
      send({ type: "ready" });
    } else if (data.type === "open") {
      if (data.bytes.byteLength > INPUT_LIMIT) { send({ type: "error", code: "resource-limit" }); return; }
      const pages = engine.openVisio(new Uint8Array(data.bytes));
      if (!pages) send({ type: "error", code: "invalid-file" });
      else if (pages < 0 || pages > 512) send({ type: "error", code: "resource-limit" });
      else send({ type: "opened", pages });
    } else {
      const svg = engine.pageSvg(data.index);
      if (svg.length > 16 * 1024 * 1024) send({ type: "error", code: "resource-limit" });
      else if (!svg) send({ type: "error", code: "invalid-file" });
      else send({ type: "page", svg });
    }
  } catch {
    send({ type: "error", code: data.type === "init" ? "unsupported-environment" : "invalid-file" });
  }
};
