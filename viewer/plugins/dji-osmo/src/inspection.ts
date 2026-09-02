import type { ProbeViewerContext } from "@anyfile/viewer-protocol";

import { inspectDjiOsmoPhoto, type DjiOsmoPhotoInspection } from "./photo-inspection";
import { readBlob } from "./read-blob";
import { inspectDjiOsmoVideo, type DjiOsmoVideoInspection } from "./video-inspection";

const JPEG_PROBE_BYTES = 256 * 1024;

export type DjiOsmoInspection = DjiOsmoPhotoInspection | DjiOsmoVideoInspection;

export async function inspectDjiOsmoFile(
  { file, signal }: ProbeViewerContext,
): Promise<DjiOsmoInspection | undefined> {
  const dot = file.name.lastIndexOf(".");
  const extension = dot < 0 ? "" : file.name.slice(dot).toLowerCase();
  if (extension === ".osv") return inspectDjiOsmoVideo(file, signal);
  if (extension === ".jpg" || extension === ".jpeg") {
    if (file.size === 0) return undefined;
    const bytes = await readBlob(file.slice(0, Math.min(file.size, JPEG_PROBE_BYTES)), signal);
    return inspectDjiOsmoPhoto(bytes);
  }
  return undefined;
}

export const DJI_OSMO_PHOTO_PROBE_BUDGET = JPEG_PROBE_BYTES;
