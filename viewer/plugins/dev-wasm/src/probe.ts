import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { readFileRange } from "@anyfile/dev-binary-core";

const HEADER = Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00);

export async function probeDevWasm({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("__anyfile_dev_wasm_probe_v1__: aborted", "AbortError");
  if (file.size < HEADER.length) return 0;
  const bytes = await readFileRange(file, signal, 0, HEADER.length);
  return HEADER.every((byte, index) => bytes[index] === byte) ? 2 : 0;
}
