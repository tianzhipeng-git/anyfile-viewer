import type { ByteSource } from "@anyfile/dev-binary-core";
import { ViewerError } from "@anyfile/viewer-protocol";

export const MAX_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_PROGRAM_HEADERS = 256;
export const MAX_SECTIONS = 2048;
export const MAX_LOAD_COMMANDS = 4096;
export const MAX_SIZEOF_CMDS = 4 * 1024 * 1024;
export const MAX_FAT_ARCHS = 32;
export const MAX_DYNAMIC_ENTRIES = 4096;
export const MAX_ARCHIVE_MEMBERS = 4096;
export const MAX_SYMBOLS_PARSED = 4096;
export const MAX_IMPORTS_PER_DLL = 2048;
export const MAX_STRING_TABLE_BYTES = 8 * 1024 * 1024;
export const MAX_NOTE_BYTES = 256 * 1024;
export const MAX_DEBUG_ENTRIES = 64;

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

export function invalidFile(message: string): never {
  throw new ViewerError("invalid-file", message);
}

export function resourceLimit(message: string): never {
  throw new ViewerError("resource-limit", message);
}

export function checkedAdd(a: number, b: number, label = "Offset"): number {
  const sum = a + b;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0 || !Number.isSafeInteger(sum)) {
    invalidFile(`${label} overflows safe integer bounds.`);
  }
  return sum;
}

export function checkedMul(a: number, b: number, label = "Table size"): number {
  const product = a * b;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0 || !Number.isSafeInteger(product)) {
    resourceLimit(`${label} exceeds safe integer bounds.`);
  }
  return product;
}

export function bigIntToSafeNumber(value: bigint, label = "Offset"): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    resourceLimit(`${label} exceeds safe integer bounds.`);
  }
  return Number(value);
}

export function assertWithinBounds(size: number, offset: number, length: number, label: string): number {
  const end = checkedAdd(offset, length, label);
  if (end > size) invalidFile(`${label} extends past the end of the file.`);
  return end;
}

export function createDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function readCString(bytes: Uint8Array, offset: number, maxLength = 4096): string {
  if (offset < 0 || offset >= bytes.length) return "";
  const limit = Math.min(bytes.length, offset + maxLength);
  let end = offset;
  while (end < limit && bytes[end] !== 0) end += 1;
  return utf8Decoder.decode(bytes.subarray(offset, end));
}

export function readFixedAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return "";
  let end = offset;
  const max = offset + length;
  while (end < max && bytes[end] !== 0) end += 1;
  return utf8Decoder.decode(bytes.subarray(offset, end));
}

export function formatHex(value: number | bigint, padWidth = 0): string {
  const hex = value.toString(16);
  const padded = padWidth > hex.length ? hex.padStart(padWidth, "0") : hex;
  return `0x${padded}`;
}

export function toHexBytes(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function sanitizeEmbeddedPath(rawPath: string): string {
  const cleaned = rawPath.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return cleaned
    .replace(/^([A-Za-z]:\\Users\\)([^\\]+)/i, "$1<user>")
    .replace(/^(\/Users\/|\/home\/)([^/]+)/, "$1<user>");
}

export async function readBoundedStringTable(
  source: ByteSource,
  offset: number,
  size: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (offset < 0 || size <= 0 || offset >= source.size) return { bytes: new Uint8Array(0), truncated: false };
  const clamped = Math.min(size, source.size - offset, MAX_STRING_TABLE_BYTES);
  const bytes = await source.read(offset, clamped);
  return { bytes, truncated: clamped < size };
}
