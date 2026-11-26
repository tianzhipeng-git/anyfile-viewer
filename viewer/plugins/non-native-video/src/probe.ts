import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectMatroska } from "./matroska-probe";
import { inspectMpegTs } from "./mpeg-ts-probe";
import { inspectMov } from "./mov-probe";
import { inspectOgg } from "./ogg-probe";
import { readProbeHead, readProbeSlices } from "./read-blob";

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

export interface NonNativeVideoInspection {
  /** Ogg Theora decodes in software (WASM worker); other containers need WebCodecs. */
  readonly softwareDecoded: boolean;
  readonly hasAudio: boolean;
}

/** Pure byte inspection shared by every host; browser capability checks live in `./browser-probe`. */
export async function inspectNonNativeVideo(
  file: File,
  signal: AbortSignal,
): Promise<NonNativeVideoInspection | null> {
  if (file.size === 0) return null;
  const extension = extensionOf(file.name);
  if ([".mkv", ".mk3d"].includes(extension)) {
    const { head, tail } = await readProbeSlices(file, signal);
    const inspection = inspectMatroska(head, tail, file.size);
    if (!inspection?.hasSeekIndex) return null;
    return { softwareDecoded: false, hasAudio: inspection.tracks.some(({ type }) => type === "audio") };
  }
  if ([".ts", ".mts", ".m2ts", ".m2t"].includes(extension)) {
    const inspection = inspectMpegTs(await readProbeHead(file, signal));
    return inspection ? { softwareDecoded: false, hasAudio: inspection.audioCodec !== null } : null;
  }
  if ([".mov", ".qt"].includes(extension)) {
    const inspection = inspectMov(await readProbeSlices(file, signal));
    return inspection ? { softwareDecoded: false, hasAudio: inspection.audioCodec !== null } : null;
  }
  if ([".ogv", ".ogg"].includes(extension)) {
    const inspection = inspectOgg(await readProbeHead(file, signal));
    return inspection ? { softwareDecoded: true, hasAudio: inspection.audioCodec !== null } : null;
  }
  return null;
}

export async function probeNonNativeVideo(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  return (await inspectNonNativeVideo(file, signal)) ? 3 : 0;
}
