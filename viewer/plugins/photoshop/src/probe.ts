import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectPhotoshopHeader, PHOTOSHOP_HEADER_BYTES } from "./format";

// Tagged abort message: also serves as the build-time marker that locates this
// deferred probe chunk (see scripts/check-view-bundle.mjs).
function abortError(): DOMException {
  return new DOMException("__anyfile_photoshop_probe_v1__: operation aborted.", "AbortError");
}

export async function probePhotoshop(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw abortError();
  const bytes = new Uint8Array(await file.slice(0, PHOTOSHOP_HEADER_BYTES).arrayBuffer());
  if (signal.aborted) throw abortError();
  return inspectPhotoshopHeader(bytes) ? 3 : 0;
}
