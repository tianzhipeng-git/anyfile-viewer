import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { findDataFileFormat } from "./formats";

export async function probeDuckDB({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("__anyfile_data_probe_v1__: aborted", "AbortError");
  // Paged rows expose the main content; inferred types and nested values remain simplified.
  return findDataFileFormat(file.name) ? 3 : 0;
}
