import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { PROBE_BYTES } from "./limits";
import { inspectRasterHeader } from "./probe-format";
import { readBlob } from "./read-blob";

export async function probeGeneralRaster(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (file.size === 0) return 0;
  const header = await readBlob(file.slice(0, PROBE_BYTES), signal);
  return inspectRasterHeader(header, file.size)?.supportLevel ?? 0;
}
