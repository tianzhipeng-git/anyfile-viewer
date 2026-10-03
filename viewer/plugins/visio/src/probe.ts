import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { readBlob } from "./read";
export function matchesHeader(bytes: Uint8Array, extension: string) {
  const magic = extension === "vsd" ? [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
    : extension === "vsdx" ? [0x50, 0x4b, 0x03, 0x04] : [];
  return magic.length > 0 && magic.every((value, index) => bytes[index] === value);
}
export async function probeVisio({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  signal.throwIfAborted();
  const bytes = new Uint8Array(await readBlob(file.slice(0, 8), signal));
  signal.throwIfAborted();
  // Container signature only: the full parser validates Visio streams/parts in open().
  return matchesHeader(bytes, file.name.split(".").pop()!.toLowerCase()) ? 3 : 0;
}
