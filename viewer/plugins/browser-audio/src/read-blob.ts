export const AUDIO_PROBE_HEAD_BYTES = 256 * 1024;
export const AUDIO_PROBE_TAIL_BYTES = 64 * 1024;
export const AUDIO_PROBE_TOTAL_BYTES = AUDIO_PROBE_HEAD_BYTES + AUDIO_PROBE_TAIL_BYTES;

import { abortError } from "./abort-error";

async function readBlob(blob: Blob, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      byteLength += value.byteLength;
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  if (signal.aborted) throw abortError();
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export interface AudioProbeSlices {
  readonly head: Uint8Array;
  readonly tail?: Uint8Array;
  readonly tailOffset: number;
}

export async function readAudioProbeSlices(file: File, signal: AbortSignal): Promise<AudioProbeSlices> {
  const headEnd = Math.min(file.size, AUDIO_PROBE_HEAD_BYTES);
  const head = await readBlob(file.slice(0, headEnd), signal);
  if (file.size <= headEnd) return { head, tailOffset: headEnd };
  const tailOffset = Math.max(headEnd, file.size - AUDIO_PROBE_TAIL_BYTES);
  const tail = await readBlob(file.slice(tailOffset), signal);
  if (head.byteLength + tail.byteLength > AUDIO_PROBE_TOTAL_BYTES) {
    throw new Error("Audio probe read budget exceeded");
  }
  return { head, tail, tailOffset };
}
