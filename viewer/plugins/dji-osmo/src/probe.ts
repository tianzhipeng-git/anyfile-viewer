import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectDjiOsmoFile } from "./inspection";

export async function probeDjiOsmo(context: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (context.signal.aborted) {
    throw new DOMException("__anyfile_dji_osmo_probe_v1__: operation aborted.", "AbortError");
  }
  const inspection = await inspectDjiOsmoFile(context);
  return inspection?.kind === "photo" ? 5 : inspection?.kind === "video" ? 3 : 0;
}
