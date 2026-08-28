import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { inspectImageFile } from "./format";
import { IMAGE_HEADER_BYTES, readBlob } from "./read-blob";

export async function probeBrowserImage(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (file.size === 0) return 0;

  const header = await readBlob(file.slice(0, IMAGE_HEADER_BYTES), signal);
  const info = inspectImageFile(header);
  if (!info) return 0;
  if (info.format === "BMP" || info.format === "ICO" || info.format === "CUR" || info.animated && info.format === "AVIF") {
    return 3;
  }
  return 4;
}
