import { readFileRange } from "@anyfile/dev-binary-core";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const MAX_PROBE_BYTES = 64 * 1024;

export async function probeDevSourceMap({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("__anyfile_dev_source_map_probe_v1__: aborted", "AbortError");
  if (file.size < 2) return 0;
  const bytes = await readFileRange(file, signal, 0, Math.min(file.size, MAX_PROBE_BYTES));
  let prefix: string;
  try {
    prefix = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return 0;
  }
  if (!prefix.trimStart().startsWith("{")) return 0;
  if (!/"version"\s*:\s*3(?:\D|$)/.test(prefix)) return 0;
  return /"(?:mappings|sections)"\s*:/.test(prefix) ? 3 : 0;
}
