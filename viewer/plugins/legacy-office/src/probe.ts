import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const CFBF_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const PROBE_READ_BYTES = 512;

async function readBoundedHeader(file: File, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  const slice = file.slice(0, Math.min(file.size, limit));
  const buffer = await slice.arrayBuffer();
  signal.throwIfAborted();
  return new Uint8Array(buffer);
}

export function isCfbfHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 512) return false;
  for (let i = 0; i < CFBF_MAGIC.length; i += 1) {
    if (bytes[i] !== CFBF_MAGIC[i]) return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteOrder = view.getUint16(28, true);
  const sectorShift = view.getUint16(30, true);
  return byteOrder === 0xfffe && (sectorShift === 9 || sectorShift === 12);
}

export function isRtfHeader(bytes: Uint8Array): boolean {
  let start = 0;
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3;
  }
  while (
    start < bytes.byteLength &&
    (bytes[start] === 0x20 || bytes[start] === 0x09 || bytes[start] === 0x0a || bytes[start] === 0x0d)
  ) {
    start += 1;
  }
  if (bytes.byteLength - start < 5) return false;
  return (
    bytes[start] === 0x7b && // {
    bytes[start + 1] === 0x5c && // \
    bytes[start + 2] === 0x72 && // r
    bytes[start + 3] === 0x74 && // t
    bytes[start + 4] === 0x66 // f
  );
}

export async function probeLegacyOffice({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  signal.throwIfAborted();
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".rtf")) {
    if (file.size < 6) return 0;
    const header = await readBoundedHeader(file, 64, signal);
    return isRtfHeader(header) ? 3 : 0;
  }

  if (lower.endsWith(".doc")) {
    if (file.size < 6) return 0;
    const header = await readBoundedHeader(file, PROBE_READ_BYTES, signal);
    if (isRtfHeader(header)) return 3;
    return isCfbfHeader(header) ? 3 : 0;
  }

  if (lower.endsWith(".ppt")) {
    if (file.size < 512) return 0;
    const header = await readBoundedHeader(file, PROBE_READ_BYTES, signal);
    return isCfbfHeader(header) ? 3 : 0;
  }

  return 0;
}
