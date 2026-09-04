import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectPxd } from "./inspect";

export async function probePixelmatorPxd(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  const inspection = await inspectPxd(file, signal);
  if (!inspection) return 0;
  if (inspection.hasMetadata && inspection.previewName) return 2;
  return 0;
}
