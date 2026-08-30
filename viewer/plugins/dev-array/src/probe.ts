import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const NPY_MAGIC = Uint8Array.of(0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59);
const ZIP_MAGIC = 0x04034b50;
const EOCD_MAGIC = 0x06054b50;
const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_ZIP_TAIL_BYTES = 22 + 0xffff;

function abortError() {
  return new DOMException("__anyfile_dev_array_probe_v1__: aborted", "AbortError");
}

async function read(file: File, signal: AbortSignal, start: number, length: number) {
  if (signal.aborted) throw abortError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return new Uint8Array(await Promise.race([file.slice(start, start + length).arrayBuffer(), aborted]));
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function sameMagic(bytes: Uint8Array) {
  return NPY_MAGIC.every((byte, index) => bytes[index] === byte);
}

async function probeNpy(file: File, signal: AbortSignal): Promise<ViewerSupportLevel> {
  if (file.size < 10) return 0;
  const prefix = await read(file, signal, 0, Math.min(12, file.size));
  if (!sameMagic(prefix)) return 0;
  const major = prefix[6];
  const minor = prefix[7];
  if (major < 1 || major > 3 || minor !== 0 || prefix.length < (major === 1 ? 10 : 12)) return 0;
  const data = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const headerLength = major === 1 ? data.getUint16(8, true) : data.getUint32(8, true);
  const preamble = major === 1 ? 10 : 12;
  if (!headerLength || headerLength > MAX_HEADER_BYTES || preamble + headerLength > file.size) return 0;
  const header = await read(file, signal, preamble, headerLength);
  let text: string;
  try {
    text = new TextDecoder(major === 3 ? "utf-8" : "latin1", { fatal: true }).decode(header);
  } catch {
    return 0;
  }
  if (!/['"]descr['"]\s*:/.test(text) || !/['"]shape['"]\s*:/.test(text) ||
      !/['"]fortran_order['"]\s*:/.test(text)) return 0;
  return /['"][<>=|]?O[0-9]*['"]/.test(text) ? 1 : 3;
}

async function probeNpz(file: File, signal: AbortSignal): Promise<ViewerSupportLevel> {
  if (file.size < 22) return 0;
  const prefix = await read(file, signal, 0, 4);
  if (new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint32(0, true) !== ZIP_MAGIC) return 0;
  const tailLength = Math.min(file.size, MAX_ZIP_TAIL_BYTES);
  const tail = await read(file, signal, file.size - tailLength, tailLength);
  const data = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (data.getUint32(offset, true) === EOCD_MAGIC && offset + 22 + data.getUint16(offset + 20, true) === tail.length) return 2;
  }
  return 0;
}

export async function probeDevArray({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".npy")) return probeNpy(file, signal);
  if (name.endsWith(".npz")) return probeNpz(file, signal);
  return 0;
}
