import { parseSkpForViewer } from "./skp";
import { SkpLimitError } from "./skp-limits";

self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
  try {
    const result = parseSkpForViewer(data);
    self.postMessage({ result }, { transfer: [result] });
  } catch (error) {
    self.postMessage({ error: error instanceof RangeError ? "resource-limit" : "invalid-file", detail: error instanceof SkpLimitError ? error.detail : undefined });
  }
};
