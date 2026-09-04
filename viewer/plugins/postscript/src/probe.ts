import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { readBlob } from "./read-blob";

const PROBE_BYTES = 4_096;
const DOS_EPS_MAGIC = [0xc5, 0xd0, 0xd3, 0xc6] as const;

export async function probePostscript(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  const bytes = new Uint8Array(await readBlob(file.slice(0, PROBE_BYTES), signal));
  if (DOS_EPS_MAGIC.every((value, index) => bytes[index] === value)) return 3;
  const header = new TextDecoder("latin1").decode(bytes);
  return header.startsWith("%!PS-Adobe-") ? 3 : 0;
}
