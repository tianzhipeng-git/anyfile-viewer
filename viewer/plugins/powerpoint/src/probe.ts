import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

export async function probePowerPointPresentation({ signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  return 4;
}
