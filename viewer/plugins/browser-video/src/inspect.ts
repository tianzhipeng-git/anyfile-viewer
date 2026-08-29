import type { ProbeViewerContext } from "@anyfile/viewer-protocol";

import { inspectIsoBmff } from "./iso-bmff";
import { readVideoProbeSlices } from "./read-blob";
import type { VideoContainer, VideoFileInspection } from "./types";
import { inspectWebm } from "./webm";

const ISO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "qt", "3gp", "3g2"]);

function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index + 1).toLowerCase();
}

function expectedContainer(extension: string): VideoContainer | undefined {
  if (extension === "webm") return "WebM";
  if (extension === "mov" || extension === "qt") return "QuickTime";
  if (extension === "3gp" || extension === "3g2") return "3GPP";
  if (extension === "mp4" || extension === "m4v") return "MP4";
  return undefined;
}

export async function inspectVideoFile(
  { file, signal }: ProbeViewerContext,
): Promise<VideoFileInspection | undefined> {
  if (file.size === 0) return undefined;
  const extension = extensionOf(file.name);
  const expected = expectedContainer(extension);
  if (!expected) return undefined;
  const slices = await readVideoProbeSlices(file, signal);
  const inspection = extension === "webm"
    ? inspectWebm(slices.head)
    : ISO_EXTENSIONS.has(extension)
      ? inspectIsoBmff(slices)
      : undefined;
  return inspection?.container === expected ? inspection : undefined;
}
