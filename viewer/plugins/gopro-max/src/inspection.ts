import { inspectGoProMaxPhoto, type GoProMaxPhotoInspection } from "./photo-inspection";
import { readBlob } from "./read-blob";
import { inspectGoProMaxVideo, type GoProMaxVideoInspection } from "./video-inspection";

const JPEG_PROBE_BYTES = 256 * 1024;

export type GoProMaxInspection = GoProMaxPhotoInspection | GoProMaxVideoInspection;

export async function inspectGoProMaxFile(
  context: { file: File; signal: AbortSignal },
): Promise<GoProMaxInspection | undefined> {
  const extension = context.file.name.slice(context.file.name.lastIndexOf(".")).toLowerCase();
  if (extension === ".360") return inspectGoProMaxVideo(context.file, context.signal);
  if (extension === ".jpg" || extension === ".jpeg") {
    const bytes = await readBlob(context.file.slice(0, Math.min(context.file.size, JPEG_PROBE_BYTES)), context.signal);
    return inspectGoProMaxPhoto(bytes);
  }
  return undefined;
}

export const GOPRO_MAX_PHOTO_PROBE_BUDGET = JPEG_PROBE_BYTES;
