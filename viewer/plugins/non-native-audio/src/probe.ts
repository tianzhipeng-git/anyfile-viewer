import { inspectMatroskaTracks } from "@anyfile/non-native-video-viewer/container-inspection";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { MATROSKA_CODECS } from "./limits";
import { readProbeSlices } from "./read-blob";
import { inspectWaveLaw } from "./wave-probe";

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

function hasEnvironment() {
  return typeof AudioContext !== "undefined" && typeof AudioDecoder !== "undefined";
}

async function probeMatroska(file: File, signal: AbortSignal): Promise<ViewerSupportLevel> {
  const { head, tail } = await readProbeSlices(file, signal);
  const inspection = inspectMatroskaTracks(head, tail, file.size);
  if (!inspection?.hasSeekIndex || inspection.tracks.some(({ type }) => type === "video")) return 0;
  const audio = inspection.tracks.filter(({ type }) => type === "audio");
  if (audio.length !== 1 || !MATROSKA_CODECS.has(audio[0].codec)) return 0;
  return 3;
}

async function probeWave(file: File, signal: AbortSignal): Promise<ViewerSupportLevel> {
  const { head } = await readProbeSlices(file, signal);
  return inspectWaveLaw(head) ? 3 : 0;
}

export async function probeNonNativeAudio(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (!file.size || !hasEnvironment()) return 0;
  const extension = extensionOf(file.name);
  if (extension === ".mka") return probeMatroska(file, signal);
  if (extension === ".wav" || extension === ".wave") return probeWave(file, signal);
  return 0;
}
