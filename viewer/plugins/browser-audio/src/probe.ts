import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { inspectBrowserAudioFile } from "./inspect";

export async function probeBrowserAudio(context: ProbeViewerContext): Promise<ViewerSupportLevel> {
  return await inspectBrowserAudioFile(context) ? 3 : 0;
}
