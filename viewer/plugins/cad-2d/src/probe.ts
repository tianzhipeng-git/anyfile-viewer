import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { abortError, CAD_PROBE_BYTES, decodeDxfBytes } from "./read";

const BINARY_DXF_PREFIX = "AutoCAD Binary DXF";

export async function probeCad2d(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw abortError();
  if (file.size === 0) return 0;
  const bytes = new Uint8Array(await file.slice(0, CAD_PROBE_BYTES).arrayBuffer());
  if (signal.aborted) throw abortError();
  if (bytes.includes(0)) return 0;
  const source = decodeDxfBytes(bytes).replace(/^\uFEFF/, "");
  if (source.startsWith(BINARY_DXF_PREFIX)) return 0;
  return /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\b/i.test(source) ? 3 : 0;
}
