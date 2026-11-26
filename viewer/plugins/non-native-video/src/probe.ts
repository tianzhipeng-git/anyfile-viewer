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

export async function probeNonNativeVideo(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (file.size === 0) return 0;
  const extension = extensionOf(file.name);
  if ([".mkv", ".mk3d"].includes(extension)) {
    const { head, tail } = await readProbeSlices(file, signal);
    const inspection = inspectMatroska(head, tail, file.size);
    return inspection?.hasSeekIndex ? 3 : 0;
  }
  if ([".ts", ".mts", ".m2ts", ".m2t"].includes(extension)) {
    return inspectMpegTs(await readProbeHead(file, signal)) ? 3 : 0;
  }
  if ([".mov", ".qt"].includes(extension)) {
    return inspectMov(await readProbeSlices(file, signal)) ? 3 : 0;
  }
  if ([".ogv", ".ogg"].includes(extension)) {
    return inspectOgg(await readProbeHead(file, signal)) ? 3 : 0;
  }
  return 0;
}
