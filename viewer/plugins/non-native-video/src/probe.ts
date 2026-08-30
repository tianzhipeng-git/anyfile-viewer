import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectMatroska } from "./matroska-probe";
import { inspectMpegTs } from "./mpeg-ts-probe";
import { inspectMov } from "./mov-probe";
import { inspectOgg } from "./ogg-probe";
import { readProbeHead, readProbeSlices } from "./read-blob";

function extensionOf(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

export async function probeNonNativeVideo(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (file.size === 0) return 0;
  const extension = extensionOf(file.name);
  let hasAudio: boolean;
  if ([".mkv", ".mk3d"].includes(extension)) {
    const { head, tail } = await readProbeSlices(file, signal);
    const inspection = inspectMatroska(head, tail, file.size);
    if (!inspection?.hasSeekIndex) return 0;
    hasAudio = inspection.tracks.some(({ type }) => type === "audio");
  } else if ([".ts", ".mts", ".m2ts", ".m2t"].includes(extension)) {
    const inspection = inspectMpegTs(await readProbeHead(file, signal));
    if (!inspection) return 0;
    hasAudio = inspection.audioCodec !== null;
  } else if ([".mov", ".qt"].includes(extension)) {
    const inspection = inspectMov(await readProbeSlices(file, signal));
    if (!inspection) return 0;
    hasAudio = inspection.audioCodec !== null;
  } else if ([".ogv", ".ogg"].includes(extension)) {
    const inspection = inspectOgg(await readProbeHead(file, signal));
    if (!inspection) return 0;
    if (typeof WebAssembly === "undefined" || typeof Worker === "undefined") return 0;
    hasAudio = inspection.audioCodec !== null;
  } else {
    return 0;
  }
  if (![".ogv", ".ogg"].includes(extension) && typeof VideoDecoder === "undefined") return 0;
  if (hasAudio && (typeof AudioContext === "undefined"
    || (![".ogv", ".ogg"].includes(extension) && typeof AudioDecoder === "undefined"))) return 0;
  return 3;
}
