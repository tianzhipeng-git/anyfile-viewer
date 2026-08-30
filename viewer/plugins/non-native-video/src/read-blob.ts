import { PROBE_HEAD_BYTES, PROBE_TAIL_BYTES, PROBE_TOTAL_BYTES } from "./probe-limits";

export function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readBlob(blob: Blob, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.byteLength;
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  if (signal.aborted) throw abortError();
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export interface ProbeSlices {
  readonly head: Uint8Array;
  readonly tail?: Uint8Array;
}

export async function readProbeHead(file: File, signal: AbortSignal) {
  return readBlob(file.slice(0, Math.min(file.size, PROBE_HEAD_BYTES)), signal);
}

export async function readProbeSlices(file: File, signal: AbortSignal): Promise<ProbeSlices> {
  const headEnd = Math.min(file.size, PROBE_HEAD_BYTES);
  const head = await readProbeHead(file, signal);
  if (file.size <= headEnd) return { head };
  const tailStart = Math.max(headEnd, file.size - PROBE_TAIL_BYTES);
  const tail = await readBlob(file.slice(tailStart), signal);
  if (head.byteLength + tail.byteLength > PROBE_TOTAL_BYTES) {
    throw new Error("Non-native video probe read budget exceeded");
  }
  return { head, tail };
}
