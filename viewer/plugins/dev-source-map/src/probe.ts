import { readFileRange } from "@anyfile/dev-binary-core";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const PROBE_CHUNK_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const PATTERN_OVERLAP = 256;

export async function probeDevSourceMap({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("__anyfile_dev_source_map_probe_v1__: aborted", "AbortError");
  if (file.size < 2 || file.size > MAX_FILE_BYTES) return 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let tail = "";
  let sawObjectStart = false;
  let sawVersion = false;
  let sawContent = false;
  try {
    for (let offset = 0; offset < file.size; offset += PROBE_CHUNK_BYTES) {
      const length = Math.min(PROBE_CHUNK_BYTES, file.size - offset);
      const bytes = await readFileRange(file, signal, offset, length);
      const text = tail + decoder.decode(bytes, { stream: offset + length < file.size });
      if (!sawObjectStart) sawObjectStart = text.trimStart().startsWith("{");
      sawVersion ||= /"version"\s*:\s*3\s*[,}]/.test(text);
      sawContent ||= /"(?:mappings|sections)"\s*:/.test(text);
      if (sawObjectStart && sawVersion && sawContent) return 3;
      tail = text.slice(-PATTERN_OVERLAP);
    }
    decoder.decode();
  } catch {
    if (signal.aborted) throw new DOMException("__anyfile_dev_source_map_probe_v1__: aborted", "AbortError");
    return 0;
  }
  return 0;
}
