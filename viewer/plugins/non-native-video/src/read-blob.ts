import { PROBE_HEAD_BYTES, PROBE_TAIL_BYTES, PROBE_TOTAL_BYTES } from "./probe-limits";
import { readBlob } from "@anyfile/viewer-protocol";

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
