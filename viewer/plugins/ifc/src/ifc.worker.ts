import type { IfcAPI } from "web-ifc";
import { parseIfc } from "./parse";
import type { IfcWorkerRequest } from "./types";
let api: IfcAPI;
self.onmessage = async ({ data }: MessageEvent<IfcWorkerRequest>) => {
  if (data.type === "init") {
    try {
      const runtime = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ data.runtimeUrl);
      api = new runtime.IfcAPI();
      await api.Init(path => new URL(path, data.runtimeUrl).href, true);
      api.SetLogLevel(6);
      self.postMessage({ type: "ready" });
    } catch { self.postMessage({ type: "error", code: "unsupported-environment" }); }
    return;
  }
  try {
    const result = parseIfc(api, new Uint8Array(data.bytes));
    const transfer = result.geometries.flatMap(geometry => [geometry.vertices.buffer, geometry.indices.buffer]) as ArrayBuffer[];
    self.postMessage({ type: "opened", result }, { transfer });
  } catch (error) {
    self.postMessage({ type: "error", code: error instanceof RangeError ? "resource-limit" : "invalid-file" });
  } finally { api.Dispose(); }
};
