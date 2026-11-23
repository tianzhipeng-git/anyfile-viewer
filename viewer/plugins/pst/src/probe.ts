import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { parseHeader } from "./header";

export const PST_PROBE_BYTES = 564;

/** Bounded header probe: the `!BDN` magic, PST/OST client magic and a known version. */
export async function probePst({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (file.size < PST_PROBE_BYTES) return 0;
  const bytes = new Uint8Array(await file.slice(0, PST_PROBE_BYTES).arrayBuffer());
  if (signal.aborted) return 0;
  const header = parseHeader(bytes);
  return header && header.cryptMethod <= 1 ? 3 : 0;
}
