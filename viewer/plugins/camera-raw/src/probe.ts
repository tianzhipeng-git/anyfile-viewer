import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { inspectRawHeader } from "./probe-format";
import { readBlob } from "./read-blob";

const PROBE_BYTES = 1024 * 1024;

export async function probeCameraRaw({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (file.size === 0) return 0;
  const inspection = inspectRawHeader(await readBlob(file.slice(0, PROBE_BYTES), signal), file.name);
  if (!inspection) return 0;
  return 2;
}
