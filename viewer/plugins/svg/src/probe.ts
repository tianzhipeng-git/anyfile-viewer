import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { looksLikeSvg } from "./sanitize";
import { readBlob, SVG_PROBE_BYTES } from "./read";

export async function probeSafeSvg(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (file.size === 0) return 0;
  const header = await readBlob(file.slice(0, SVG_PROBE_BYTES), signal, SVG_PROBE_BYTES);
  if (header[0] === 0x1f && header[1] === 0x8b) return 3;
  return looksLikeSvg(header) ? 3 : 0;
}
