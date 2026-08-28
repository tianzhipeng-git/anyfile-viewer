import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const SQLITE_HEADER = new TextEncoder().encode("SQLite format 3\0");

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readHeader(file: File, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const reader = file.slice(0, SQLITE_HEADER.length).stream().getReader();
  const header = new Uint8Array(SQLITE_HEADER.length);
  let offset = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });

  try {
    while (offset < header.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, header.length - offset);
      header.set(chunk, offset);
      offset += chunk.length;
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }

  if (signal.aborted) throw abortError();
  return header.subarray(0, offset);
}

export async function probeSQLite(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  const header = await readHeader(file, signal);
  return header.length === SQLITE_HEADER.length && SQLITE_HEADER.every((byte, index) => header[index] === byte)
    ? 5
    : 0;
}
