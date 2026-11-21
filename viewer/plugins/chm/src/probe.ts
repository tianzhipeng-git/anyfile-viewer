import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const ITSF_HEADER_MIN_V2 = 0x58;
const ITSF_HEADER_MIN_V3 = 0x60;
const ITSP_HEADER_SIZE = 0x54;

function readUint64Safe(view: DataView, offset: number): number | null {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  if (high > 0x001fffff) return null;
  return high * 2 ** 32 + low;
}

async function readSlice(file: File, start: number, end: number, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  const buffer = await file.slice(start, end).arrayBuffer();
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  return new Uint8Array(buffer);
}

export async function probeChm({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  if (file.size < ITSF_HEADER_MIN_V2 + ITSP_HEADER_SIZE) return 0;

  const headerBytes = await readSlice(file, 0, Math.min(file.size, ITSF_HEADER_MIN_V3), signal);
  if (headerBytes.byteLength < ITSF_HEADER_MIN_V2) return 0;

  // Magic "ITSF"
  if (headerBytes[0] !== 0x49 || headerBytes[1] !== 0x54 || headerBytes[2] !== 0x53 || headerBytes[3] !== 0x46) {
    return 0;
  }

  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  const version = view.getUint32(0x04, true);
  const headerLength = view.getUint32(0x08, true);
  if (version === 2) {
    if (headerLength < ITSF_HEADER_MIN_V2 || headerLength > 0x200) return 0;
  } else if (version === 3) {
    if (headerLength < ITSF_HEADER_MIN_V3 || headerLength > 0x200 || headerBytes.byteLength < ITSF_HEADER_MIN_V3) {
      return 0;
    }
  } else {
    return 0;
  }

  const dirOffset = readUint64Safe(view, 0x48);
  const dirLength = readUint64Safe(view, 0x50);
  if (dirOffset === null || dirLength === null) return 0;
  if (dirOffset < headerLength || dirLength < ITSP_HEADER_SIZE || dirOffset + dirLength > file.size) {
    return 0;
  }

  const itspBytes = await readSlice(file, dirOffset, dirOffset + 8, signal);
  if (itspBytes.byteLength < 8) return 0;
  // Magic "ITSP" and version 1
  if (
    itspBytes[0] !== 0x49 ||
    itspBytes[1] !== 0x54 ||
    itspBytes[2] !== 0x53 ||
    itspBytes[3] !== 0x50
  ) {
    return 0;
  }
  const itspVersion = new DataView(itspBytes.buffer, itspBytes.byteOffset, itspBytes.byteLength).getUint32(4, true);
  return itspVersion === 1 ? 4 : 0;
}
