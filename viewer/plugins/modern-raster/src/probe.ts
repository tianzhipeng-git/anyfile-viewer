import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { PROBE_BYTES } from "./limits";
import { canDecodeNativeHeic } from "./native";
import { inspectModernHeader } from "./probe-format";
import { readBlob } from "./read-blob";

export async function probeModernRaster({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (file.size === 0) return 0;
  const format = inspectModernHeader(await readBlob(file.slice(0, PROBE_BYTES), signal));
  if (format === "JXL") return 4;
  if (format === "HEIC") return await canDecodeNativeHeic() ? 3 : 0;
  return 0;
}
