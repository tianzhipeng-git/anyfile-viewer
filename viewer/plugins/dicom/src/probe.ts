import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { inspectDicom } from "./header";
import { isPart10 } from "./signature";

export async function probeDicom({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  signal.throwIfAborted();
  const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  signal.throwIfAborted();
  if (!isPart10(bytes)) return 0;
  try {
    return inspectDicom(bytes, file.size).info.reason ? 1 : 3;
  } catch {
    // Larger headers and damaged/oversized images are inspected independently on open.
    return 1;
  }
}
