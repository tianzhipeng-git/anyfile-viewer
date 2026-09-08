import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectPhotoshopHeader, PHOTOSHOP_HEADER_BYTES } from "./format";

function abortError() {
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
