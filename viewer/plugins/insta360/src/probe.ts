import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectInsta360File } from "./inspection";

export async function probeInsta360(context: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (context.signal.aborted) {
    throw new DOMException("__anyfile_insta360_probe_v1__: operation aborted.", "AbortError");
  }
  return await inspectInsta360File(context) ? 3 : 0;
}
