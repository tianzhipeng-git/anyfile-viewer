import { ViewerError } from "@anyfile/viewer-protocol";

const utf8 = new TextDecoder("utf-8", { fatal: false });

export function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

export function text(bytes: Uint8Array): string {
  return utf8.decode(bytes);
}

export function hex(value: number, width = 8): string {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined).format(value);
}

export function readUint64(data: DataView, offset: number, littleEndian = true): number {
  const value = data.getBigUint64(offset, littleEndian);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ViewerError("resource-limit", "元数据中的 64 位数值超出浏览器安全范围。");
  }
  return Number(value);
}

export function readVarint(bytes: Uint8Array, state: { offset: number }): number {
  let result = 0;
  let scale = 1;
  for (let count = 0; count < 9 && state.offset < bytes.length; count += 1) {
    const byte = bytes[state.offset++];
    result += (byte & 0x7f) * scale;
    if (result > Number.MAX_SAFE_INTEGER) {
      throw new ViewerError("resource-limit", "索引数值超出浏览器安全范围。");
    }
    if ((byte & 0x80) === 0) return result;
    scale *= 128;
  }
  throw new ViewerError("invalid-file", "压缩索引包含无效的变长整数。");
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function dangerousPath(path: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(path) || path.split(/[\\/]+/).includes("..");
}
