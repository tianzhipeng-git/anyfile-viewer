import type { ProbeViewerContext } from "@anyfile/viewer-protocol";

import { inspectInsta360Photo, type Insta360PhotoInspection } from "./jpeg-inspection";
import { readBlob } from "./read-blob";
import { inspectInsta360Video, type Insta360VideoInspection } from "./video-inspection";

const JPEG_INSPECTION_BYTES = 1024 * 1024;

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

export type Insta360Inspection = Insta360PhotoInspection | Insta360VideoInspection;

export async function inspectInsta360File(
  { file, signal }: ProbeViewerContext,
): Promise<Insta360Inspection | undefined> {
  const extension = extensionOf(file.name);
  if (extension === ".insp") {
    if (file.size === 0) return undefined;
    const bytes = await readBlob(file.slice(0, Math.min(file.size, JPEG_INSPECTION_BYTES)), signal);
    return inspectInsta360Photo(bytes);
  }
  if (extension === ".lrv" || extension === ".insv") return inspectInsta360Video(file, signal);
  return undefined;
}
