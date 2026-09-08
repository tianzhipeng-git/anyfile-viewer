import { parseCadScene } from "./scene";
self.onmessage = ({ data }: MessageEvent<string>) => {
  try { self.postMessage({ scene: parseCadScene(data) }); }
  catch (error) { self.postMessage({ error: error instanceof RangeError ? "resource-limit" : "invalid-file" }); }
};
