export interface PhotoshopHeader {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly depth: 1 | 8 | 16 | 32;
  readonly colorMode: number;
}

const HEADER_BYTES = 26;
const VALID_DEPTHS = new Set([1, 8, 16, 32]);

export function inspectPhotoshopHeader(bytes: Uint8Array): PhotoshopHeader | undefined {
  if (bytes.byteLength < HEADER_BYTES) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "8BPS" || view.getUint16(4) !== 1) return undefined;
  for (let offset = 6; offset < 12; offset += 1) if (bytes[offset] !== 0) return undefined;
  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const depth = view.getUint16(22);
  const colorMode = view.getUint16(24);
  if (channels < 1 || channels > 56 || width < 1 || height < 1 || width > 300_000 || height > 300_000) return undefined;
  if (!VALID_DEPTHS.has(depth) || colorMode > 9) return undefined;
  return { width, height, channels, depth: depth as PhotoshopHeader["depth"], colorMode };
}

export const PHOTOSHOP_HEADER_BYTES = HEADER_BYTES;
