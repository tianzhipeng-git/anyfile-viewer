import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectVideoFile } from "./inspect";

export async function probeBrowserVideo(
  context: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  const inspection = await inspectVideoFile(context);
  if (!inspection || !inspection.codecsSupported || inspection.videoTracks.length === 0) return 0;
  return 3;
}
