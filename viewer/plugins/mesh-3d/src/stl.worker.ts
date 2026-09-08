import { parseStl } from "./stl";
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try { const result = parseStl(event.data); self.postMessage({ result }, { transfer: [result.positions.buffer] }); }
  catch (error) { self.postMessage({ error: error instanceof RangeError ? "resource-limit" : "invalid-file" }); }
};
