import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { excelManifest } from "./manifest";

export async function probeExcelWorkbook({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  const name = file.name.toLowerCase();
  // Cell values expose the main content, without workbook styling or chart semantics.
  return excelManifest.formats.some(({ extensions }) =>
    extensions.some((extension) => name.endsWith(extension)),
  ) ? 3 : 0;
}
