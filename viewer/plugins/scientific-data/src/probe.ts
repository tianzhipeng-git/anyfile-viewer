import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import type { ContainerFormat } from "./types";

const HDF5_MAGIC = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a] as const;
export const PROBE_READ_BYTES = 8192;

function matchesBytes(bytes: Uint8Array, offset: number, magic: readonly number[]): boolean {
  if (offset + magic.length > bytes.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

function findHdf5SignatureOffset(bytes: Uint8Array): number {
  if (matchesBytes(bytes, 0, HDF5_MAGIC)) return 0;
  for (let offset = 512; offset + HDF5_MAGIC.length <= bytes.length; offset *= 2) {
    if (matchesBytes(bytes, offset, HDF5_MAGIC)) return offset;
  }
  return -1;
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  const end = Math.min(bytes.length, start + length);
  let out = "";
  for (let i = start; i < end; i += 1) {
    const b = bytes[i];
    if (b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

function isPrintableHeaderText(bytes: Uint8Array, length: number): boolean {
  let printable = 0;
  for (let i = 0; i < length; i += 1) {
    const b = bytes[i];
    if (b === 0) continue;
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126)) {
      printable += 1;
    } else {
      return false;
    }
  }
  return printable > 0;
}

function looksLikeMatlabV4(bytes: Uint8Array, fileSize: number): boolean {
  if (bytes.length < 24 || fileSize < 24) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const littleEndian of [true, false]) {
    const type = view.getInt32(0, littleEndian);
    const mrows = view.getInt32(4, littleEndian);
    const ncols = view.getInt32(8, littleEndian);
    const imagf = view.getInt32(12, littleEndian);
    const namlen = view.getInt32(16, littleEndian);
    if (type < 0 || type > 5052) continue;
    const m = Math.floor(type / 1000);
    const o = Math.floor((type % 1000) / 100);
    const p = Math.floor((type % 100) / 10);
    const t = type % 10;
    if (m > 4 || o !== 0 || p > 5 || t > 2) continue;
    if ((littleEndian && m !== 0) || (!littleEndian && m !== 1)) continue;
    if (mrows < 0 || ncols < 0 || (imagf !== 0 && imagf !== 1)) continue;
    if (namlen < 2 || namlen > 64 || 20 + namlen > bytes.length) continue;
    if (bytes[20 + namlen - 1] !== 0) continue;
    let validName = true;
    for (let i = 0; i < namlen - 1; i += 1) {
      const c = bytes[20 + i];
      if (c < 33 || c > 126) {
        validName = false;
        break;
      }
    }
    if (!validName) continue;
    const elemSize = p === 0 ? 8 : p === 1 || p === 2 ? 4 : p === 3 || p === 4 ? 2 : 1;
    const payload = mrows * ncols * elemSize * (imagf ? 2 : 1);
    if (20 + namlen + payload <= fileSize) return true;
  }
  return false;
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function detectScientificFormat(
  bytes: Uint8Array,
  extension: string,
  fileSize: number,
): { format: ContainerFormat; level: 3 | 4 } | null {
  const ext = extension.toLowerCase();

  const hdf5Offset = findHdf5SignatureOffset(bytes);
  if (hdf5Offset >= 0) {
    const headerText = hdf5Offset >= 512 ? readAscii(bytes, 0, 64) : "";
    if (headerText.startsWith("MATLAB 7.3") || (ext === ".mat" && hdf5Offset >= 512)) {
      return { format: "matlab-v73", level: 4 };
    }
    if (ext === ".nc" || ext === ".nc4") {
      return { format: "netcdf4", level: 4 };
    }
    return { format: "hdf5", level: 4 };
  }

  if (bytes.length >= 8 && bytes[0] === 0x43 && bytes[1] === 0x44 && bytes[2] === 0x46) {
    if (bytes[3] === 0x01) return { format: "netcdf-classic", level: 4 };
    if (bytes[3] === 0x02) return { format: "netcdf-64bit", level: 4 };
    if (bytes[3] === 0x05) return { format: "netcdf-cdf5", level: 4 };
  }

  if (bytes.length >= 128) {
    const e0 = bytes[126];
    const e1 = bytes[127];
    const isLE = e0 === 0x49 && e1 === 0x4d;
    const isBE = e0 === 0x4d && e1 === 0x49;
    if (isLE || isBE) {
      const version = isLE ? bytes[124] | (bytes[125] << 8) : (bytes[124] << 8) | bytes[125];
      if (version === 0x0100 && isPrintableHeaderText(bytes, 116)) {
        return { format: "matlab-v5", level: 4 };
      }
    }
  }

  if (ext === ".mat" && looksLikeMatlabV4(bytes, fileSize)) {
    return { format: "matlab-v4", level: 3 };
  }

  return null;
}

export async function probeScientificData({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  signal.throwIfAborted();
  const readSize = Math.min(file.size, PROBE_READ_BYTES);
  if (readSize < 8) return 0;
  const buffer = await file.slice(0, readSize).arrayBuffer();
  signal.throwIfAborted();
  const detected = detectScientificFormat(new Uint8Array(buffer), extensionOf(file.name), file.size);
  return detected ? detected.level : 0;
}
