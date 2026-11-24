import { PROBE_HEAD_BYTES, PROBE_TAIL_BYTES } from "./limits";
import { readBlob } from "@anyfile/viewer-protocol";

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
