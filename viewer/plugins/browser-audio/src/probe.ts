import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { AudioProbeLimitError } from "./basic-formats";
import { inspectBrowserAudioFile } from "./inspect";

export async function probeBrowserAudio(context: ProbeViewerContext): Promise<ViewerSupportLevel> {
  try {
    return await inspectBrowserAudioFile(context) ? 3 : 0;
  } catch (error) {
    if (error instanceof AudioProbeLimitError) return 0;
    throw error;
  }
}
