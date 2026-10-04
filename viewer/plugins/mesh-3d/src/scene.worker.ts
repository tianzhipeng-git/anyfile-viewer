import { DOMParser } from "linkedom/worker";
import { parseScene } from "./scene-parse";
// Workers lack the XML DOM API required by the COLLADA parser.
globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
self.onmessage = async ({ data }: MessageEvent<{ bytes: ArrayBuffer; format: "fbx" | "dae" }>) => {
  try { self.postMessage({ result: await parseScene(data.bytes, data.format) }); }
  catch (error) { self.postMessage({ error: error instanceof RangeError ? "resource-limit" : "invalid-file" }); }
};
