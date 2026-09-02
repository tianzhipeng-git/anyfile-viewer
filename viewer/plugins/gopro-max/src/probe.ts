import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectGoProMaxFile } from "./inspection";

export async function probeGoProMax(context: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (context.signal.aborted) {
    throw new DOMException("__anyfile_gopro_max_probe_v1__: operation aborted.", "AbortError");
  }
  const inspection = await inspectGoProMaxFile(context);
  return inspection?.kind === "photo" ? 5 : inspection?.kind === "video" ? 3 : 0;
}
