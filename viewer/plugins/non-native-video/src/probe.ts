import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectMatroska } from "./matroska-probe";
import { readProbeSlices } from "./read-blob";

function extensionOf(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

export async function probeNonNativeVideo(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (file.size === 0 || ![".mkv", ".mk3d"].includes(extensionOf(file.name))) return 0;
  const { head, tail } = await readProbeSlices(file, signal);
  const inspection = inspectMatroska(head, tail, file.size);
  if (!inspection?.hasSeekIndex || typeof VideoDecoder === "undefined") return 0;
  const hasAudio = inspection.tracks.some(({ type }) => type === "audio");
  if (hasAudio && (typeof AudioDecoder === "undefined" || typeof AudioContext === "undefined")) return 0;
  return 3;
}
