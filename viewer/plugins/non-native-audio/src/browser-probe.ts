import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { probeNonNativeAudio } from "./probe";

/** Web-host probe: declines without WebCodecs audio + Web Audio so routing falls through to FFmpeg. */
export async function probeNonNativeAudioInBrowser(context: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (typeof AudioContext === "undefined" || typeof AudioDecoder === "undefined") return 0;
  return probeNonNativeAudio(context);
}
