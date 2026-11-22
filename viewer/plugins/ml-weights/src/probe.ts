import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { detectEndianness } from "./gguf";

const GGUF_MAGIC_SIZE = 4;

/**
 * Content probe: recognises GGUF by its magic and safetensors by the invariant
 * that the little-endian u64 header length is followed by a `{`. Reads only the
 * first bytes; never loads tensor data.
 */
export async function probeMlWeights({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  if (file.size < 8) return 0;

  const head = new Uint8Array(await file.slice(0, 9).arrayBuffer());
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");

  if (head.length >= GGUF_MAGIC_SIZE && detectEndianness(new DataView(head.buffer, head.byteOffset, GGUF_MAGIC_SIZE))) {
    return 3;
  }
  // safetensors: 8-byte little-endian length, then the JSON header must start with '{'.
  if (head.length >= 9) {
    const view = new DataView(head.buffer, head.byteOffset, 8);
    const length = view.getUint32(4, true) * 0x1_0000_0000 + view.getUint32(0, true);
    if (length > 0 && length <= file.size - 8 && head[8] === 0x7b /* { */) return 3;
  }
  return 0;
}
