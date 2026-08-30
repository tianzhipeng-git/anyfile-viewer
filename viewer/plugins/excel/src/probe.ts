import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const ARCHIVE_BACKED_EXTENSIONS = [".xlsx", ".ods"];

export async function probeExcelWorkbook({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  const name = file.name.toLowerCase();
  return ARCHIVE_BACKED_EXTENSIONS.some((extension) => name.endsWith(extension)) ? 4 : 1;
}
