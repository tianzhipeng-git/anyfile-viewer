import { readFileRange } from "@anyfile/dev-binary-core";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const PROBE_HEAD_BYTES = 512;
const MAX_PE_HEADER_OFFSET = 1024 * 1024;
const MAX_FAT_ARCH_PROBE = 32;

const COFF_MACHINES = new Set([
  0x014c, // x86
  0x0162, 0x0166, 0x0168, 0x0169, 0x0266, 0x0366, 0x0466, // MIPS
  0x01c0, 0x01c2, 0x01c4, // ARM
  0x0200, // IA64
  0x5032, 0x5064, 0x5128, // RISC-V
  0x6232, 0x6264, // LoongArch
  0x8664, // x64
  0xaa64, // ARM64
]);

const MACHO_THIN_32 = new Set([0xfeedface, 0xcefaedfe]);
const MACHO_THIN_64 = new Set([0xfeedfacf, 0xcffaedfe]);
const MACHO_FAT_BE = new Set([0xcafebabe, 0xcafebabf]);
const MACHO_FAT_LE = new Set([0xbebafeca, 0xbfbafeca]);

function isElfHeader(bytes: Uint8Array, fileSize: number): boolean {
  if (bytes.length < 16) return false;
  if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) return false;
  const elfClass = bytes[4];
  const elfData = bytes[5];
  const elfVersion = bytes[6];
  if ((elfClass !== 1 && elfClass !== 2) || (elfData !== 1 && elfData !== 2) || elfVersion !== 1) return false;
  return fileSize >= (elfClass === 1 ? 52 : 64);
}

function isUnixArchiveHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  // "!<arch>\n"
  return bytes[0] === 0x21 && bytes[1] === 0x3c && bytes[2] === 0x61 && bytes[3] === 0x72
    && bytes[4] === 0x63 && bytes[5] === 0x68 && bytes[6] === 0x3e && bytes[7] === 0x0a;
}

function isValidMachOThin(bytes: Uint8Array, fileSize: number): boolean {
  if (bytes.length < 28) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, false);
  const is32 = MACHO_THIN_32.has(magic);
  const is64 = MACHO_THIN_64.has(magic);
  if (!is32 && !is64) return false;
  const headerSize = is64 ? 32 : 28;
  if (bytes.length < headerSize || fileSize < headerSize) return false;
  const le = magic === 0xcefaedfe || magic === 0xcffaedfe;
  const ncmds = view.getUint32(16, le);
  const sizeofcmds = view.getUint32(20, le);
  return ncmds <= 4096 && sizeofcmds <= 4 * 1024 * 1024 && headerSize + sizeofcmds <= fileSize;
}

function isMachOThinMagic(magic: number, fileSize: number): boolean {
  if (MACHO_THIN_32.has(magic)) return fileSize >= 28;
  if (MACHO_THIN_64.has(magic)) return fileSize >= 32;
  return false;
}

async function isMachOFat(file: File, signal: AbortSignal, bytes: Uint8Array): Promise<boolean> {
  if (bytes.length < 8) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, false);
  const littleEndian = MACHO_FAT_LE.has(magic);
  if (!littleEndian && !MACHO_FAT_BE.has(magic)) return false;

  const isFat64 = magic === 0xcafebabf || magic === 0xbfbafeca;
  const nfat = view.getUint32(4, littleEndian);
  if (nfat < 1 || nfat > MAX_FAT_ARCH_PROBE) return false;

  const entrySize = isFat64 ? 32 : 20;
  const headerEnd = 8 + nfat * entrySize;
  if (headerEnd > file.size) return false;

  const firstEntry = headerEnd <= bytes.length
    ? bytes.subarray(8, 8 + entrySize)
    : await readFileRange(file, signal, 8, entrySize);
  const entryView = new DataView(firstEntry.buffer, firstEntry.byteOffset, firstEntry.byteLength);
  const offset = isFat64
    ? Number(entryView.getBigUint64(8, littleEndian))
    : entryView.getUint32(8, littleEndian);
  const size = isFat64
    ? Number(entryView.getBigUint64(16, littleEndian))
    : entryView.getUint32(12, littleEndian);
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < headerEnd || size < 28 || offset + size > file.size) {
    return false;
  }

  const sliceMagicBytes = await readFileRange(file, signal, offset, 4);
  const sliceMagic = new DataView(sliceMagicBytes.buffer, sliceMagicBytes.byteOffset, 4).getUint32(0, false);
  return isMachOThinMagic(sliceMagic, size);
}

async function isPeBinary(file: File, signal: AbortSignal, bytes: Uint8Array): Promise<boolean> {
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset < 64 || peOffset > MAX_PE_HEADER_OFFSET || peOffset + 24 > file.size) return false;

  const peHeader = peOffset + 24 <= bytes.length
    ? bytes.subarray(peOffset, peOffset + 24)
    : await readFileRange(file, signal, peOffset, 24);
  if (peHeader[0] !== 0x50 || peHeader[1] !== 0x45 || peHeader[2] !== 0x00 || peHeader[3] !== 0x00) return false;

  const peView = new DataView(peHeader.buffer, peHeader.byteOffset, peHeader.byteLength);
  const sections = peView.getUint16(6, true);
  const optSize = peView.getUint16(20, true);
  return sections <= 2048 && peOffset + 24 + optSize + sections * 40 <= file.size;
}

function isValidCoffSectionName(bytes: Uint8Array, offset: number): boolean {
  let sawNul = false;
  for (let i = 0; i < 8; i += 1) {
    const ch = bytes[offset + i];
    if (ch === 0) {
      sawNul = true;
      continue;
    }
    if (sawNul) return true;
    if (ch < 0x20 || ch > 0x7e) return false;
  }
  return true;
}

async function isCoffObject(file: File, signal: AbortSignal, bytes: Uint8Array): Promise<boolean> {
  if (bytes.length < 20) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const machine = view.getUint16(0, true);
  if (!COFF_MACHINES.has(machine)) return false;

  const sections = view.getUint16(2, true);
  const symOffset = view.getUint32(8, true);
  const numSyms = view.getUint32(12, true);
  const optSize = view.getUint16(16, true);
  if (sections < 1 || sections > 2048 || optSize > 1024) return false;

  const tableOffset = 20 + optSize;
  if (tableOffset + sections * 40 > file.size) return false;
  if (symOffset !== 0 && (symOffset < tableOffset || symOffset + numSyms * 18 > file.size)) return false;

  const firstSec = tableOffset + 40 <= bytes.length
    ? bytes.subarray(tableOffset, tableOffset + 40)
    : await readFileRange(file, signal, tableOffset, 40);
  if (!isValidCoffSectionName(firstSec, 0)) return false;

  const secView = new DataView(firstSec.buffer, firstSec.byteOffset, 40);
  const rawSize = secView.getUint32(16, true);
  const rawPtr = secView.getUint32(20, true);
  return rawPtr === 0 || rawPtr + rawSize <= file.size;
}

export async function probeDevNativeBinary({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  if (file.size < 4) return 0;

  const head = await readFileRange(file, signal, 0, Math.min(file.size, PROBE_HEAD_BYTES));
  if (isElfHeader(head, file.size)) return 1;
  if (isUnixArchiveHeader(head)) return 1;
  if (head.length >= 4) {
    if (isValidMachOThin(head, file.size)) return 1;
    if (await isMachOFat(file, signal, head)) return 1;
  }
  if (await isPeBinary(file, signal, head)) return 1;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if ((ext === "obj" || ext === "o") && await isCoffObject(file, signal, head)) return 1;

  return 0;
}
