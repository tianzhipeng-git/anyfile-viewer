import { PROBE_HEAD_BYTES, PROBE_TAIL_BYTES } from "./limits";
import { abortError } from "./abort-error";

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
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readProbeSlices(file: File, signal: AbortSignal) {
  const headEnd = Math.min(file.size, PROBE_HEAD_BYTES);
  const head = await readBlob(file.slice(0, headEnd), signal);
  if (file.size <= headEnd) return { head, tail: undefined };
  const tail = await readBlob(file.slice(Math.max(headEnd, file.size - PROBE_TAIL_BYTES)), signal);
  if (head.byteLength + tail.byteLength > PROBE_HEAD_BYTES + PROBE_TAIL_BYTES) {
    throw new Error("Non-native audio probe read budget exceeded");
  }
  return { head, tail };
}
