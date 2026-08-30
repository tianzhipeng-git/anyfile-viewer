import { inspectMatroskaTracks } from "@anyfile/non-native-video-viewer/container-inspection";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { SUPPORTED_CODECS } from "./limits";
import { readProbeSlices } from "./read-blob";

export async function probeNonNativeAudio(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (!file.size || !file.name.toLowerCase().endsWith(".mka")) return 0;
  const { head, tail } = await readProbeSlices(file, signal);
  const inspection = inspectMatroskaTracks(head, tail, file.size);
  if (!inspection?.hasSeekIndex || inspection.tracks.some(({ type }) => type === "video")) return 0;
  const audio = inspection.tracks.filter(({ type }) => type === "audio");
  if (audio.length !== 1 || !SUPPORTED_CODECS.has(audio[0].codec)) return 0;
  if (typeof AudioContext === "undefined" || typeof AudioDecoder === "undefined") return 0;
  return 3;
}
