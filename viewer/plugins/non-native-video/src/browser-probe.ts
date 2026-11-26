import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectNonNativeVideo } from "./probe";

/**
 * Web-host probe: same byte evidence as `./probe`, but declines when this browser lacks the
 * decoders the file needs so routing falls through to the FFmpeg viewer.
 */
export async function probeNonNativeVideoInBrowser(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  const inspection = await inspectNonNativeVideo(file, signal);
  if (!inspection) return 0;
  const { softwareDecoded, hasAudio } = inspection;
  if (softwareDecoded ? typeof WebAssembly === "undefined" || typeof Worker === "undefined" : typeof VideoDecoder === "undefined") {
    return 0;
  }
  if (hasAudio && (typeof AudioContext === "undefined" || (!softwareDecoded && typeof AudioDecoder === "undefined"))) {
    return 0;
  }
  return 3;
}
