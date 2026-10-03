import { readBlob } from "./read";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
export function hasOleHeader(bytes: Uint8Array) {
  return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => bytes[index] === value);
}
export async function probeMpp({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  signal.throwIfAborted();
  if (!file.name.toLowerCase().endsWith(".mpp") || file.size < 512) return 0;
  const bytes = new Uint8Array(await readBlob(file.slice(0, 512), signal));
  signal.throwIfAborted();
  // Full MPP version and encryption validation belongs to open(), not the OLE header probe.
  return hasOleHeader(bytes) ? 3 : 0;
}
