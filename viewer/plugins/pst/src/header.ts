/** PST/OST file header ([MS-PST] 2.2.2.6) and little-endian readers; dependency-free for the probe. */

export type PstFormat = "ansi" | "unicode" | "unicode4k";

export interface PstHeader {
  readonly format: PstFormat;
  readonly isOst: boolean;
  readonly cryptMethod: number;
  readonly nbtRoot: number;
  readonly bbtRoot: number;
}

export function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/** 64-bit little endian as a JS number; PST offsets and ids stay well below 2^53. */
export function u64(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) + u32(bytes, offset + 4) * 0x1_0000_0000;
}

/** Parses the fixed header; returns null when the magic or version is not a PST/OST. */
export function parseHeader(bytes: Uint8Array): PstHeader | null {
  if (bytes.length < 528 || bytes[0] !== 0x21 || bytes[1] !== 0x42 || bytes[2] !== 0x44 || bytes[3] !== 0x4e) return null;
  const client = u16(bytes, 8);
  if (client !== 0x4d53 && client !== 0x4f53) return null;
  const version = u16(bytes, 10);
  if (version === 14 || version === 15) {
    return { format: "ansi", isOst: client === 0x4f53, cryptMethod: bytes[461], nbtRoot: u32(bytes, 188), bbtRoot: u32(bytes, 196) };
  }
  if (version !== 23 && version !== 36) return null;
  return {
    format: version === 36 ? "unicode4k" : "unicode",
    isOst: client === 0x4f53,
    cryptMethod: bytes[513],
    nbtRoot: u64(bytes, 224),
    bbtRoot: u64(bytes, 240),
  };
}
