import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

function abortError() {
  return new DOMException("__anyfile_data_probe_v1__: aborted", "AbortError");
}

export async function probeData({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw abortError();
  const name = file.name.toLowerCase();
  return name.endsWith(".duckdb") || name.endsWith(".ddb") ? 3 : 1;
}
