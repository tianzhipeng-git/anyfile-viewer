import { deflateSync } from "node:zlib";
import { AgentError, type RgbaImage } from "@anyfile/viewer-protocol";

export const DEFAULT_RENDER_MAX_DIM = 1600;
export const HARD_RENDER_MAX_DIM = 4096;

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength, false);
  for (let i = 0; i < 4; i += 1) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(chunk.subarray(4, 8 + data.byteLength)), false);
  return chunk;
}

export function normalizeMaxDimension(requested?: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_RENDER_MAX_DIM;
  }
  return Math.max(1, Math.min(Math.floor(requested), HARD_RENDER_MAX_DIM));
}

export function downscaleRgba(image: RgbaImage, maxDimension: number): RgbaImage {
  const { width, height, data } = image;
  if (width <= maxDimension && height <= maxDimension) return image;

  const scale = maxDimension / Math.max(width, height);
  const outWidth = Math.max(1, Math.min(maxDimension, Math.round(width * scale)));
  const outHeight = Math.max(1, Math.min(maxDimension, Math.round(height * scale)));
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);

  const xRatio = width / outWidth;
  const yRatio = height / outHeight;

  for (let y = 0; y < outHeight; y += 1) {
    const srcY = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(srcY)));
    const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
    const fy = Math.max(0, srcY - y0);

    for (let x = 0; x < outWidth; x += 1) {
      const srcX = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(srcX)));
      const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
      const fx = Math.max(0, srcX - x0);

      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      const dst = (y * outWidth + x) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      out[dst] = Math.round(data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11);
      out[dst + 1] = Math.round(data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11);
      out[dst + 2] = Math.round(data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11);
      out[dst + 3] = Math.round(data[i00 + 3] * w00 + data[i10 + 3] * w10 + data[i01 + 3] * w01 + data[i11 + 3] * w11);
    }
  }

  return { width: outWidth, height: outHeight, data: out };
}

/** Encodes an `RgbaImage` as a bounded RGBA8 PNG using `node:zlib` and CRC32. */
export function encodePng(image: RgbaImage, maxDimension?: number): Uint8Array {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new AgentError("invalid-file", `Invalid RGBA image dimensions: ${width}x${height}.`);
  }
  const expectedLength = width * height * 4;
  if (data.byteLength !== expectedLength) {
    throw new AgentError(
      "invalid-file",
      `RGBA buffer length mismatch: expected ${expectedLength}, got ${data.byteLength}.`,
    );
  }

  const bounded = downscaleRgba(image, normalizeMaxDimension(maxDimension));
  const rowBytes = bounded.width * 4;
  const raw = new Uint8Array(bounded.height * (1 + rowBytes));
  for (let y = 0; y < bounded.height; y += 1) {
    const rawOffset = y * (1 + rowBytes);
    raw[rawOffset] = 0; // Filter type 0 (None)
    raw.set(bounded.data.subarray(y * rowBytes, (y + 1) * rowBytes), rawOffset + 1);
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, bounded.width, false);
  ihdrView.setUint32(4, bounded.height, false);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const compressed = new Uint8Array(deflateSync(raw));
  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", new Uint8Array(0));

  const out = new Uint8Array(
    PNG_SIGNATURE.byteLength + ihdrChunk.byteLength + idatChunk.byteLength + iendChunk.byteLength,
  );
  let offset = 0;
  out.set(PNG_SIGNATURE, offset);
  offset += PNG_SIGNATURE.byteLength;
  out.set(ihdrChunk, offset);
  offset += ihdrChunk.byteLength;
  out.set(idatChunk, offset);
  offset += idatChunk.byteLength;
  out.set(iendChunk, offset);
  return out;
}

/** Validates PNG signature and IHDR header, returning `{ width, height }`. */
export function readPngDimensions(png: Uint8Array): { readonly width: number; readonly height: number } {
  if (png.byteLength < 24) {
    throw new AgentError("invalid-file", "Invalid PNG: buffer too short.");
  }
  for (let i = 0; i < PNG_SIGNATURE.byteLength; i += 1) {
    if (png[i] !== PNG_SIGNATURE[i]) {
      throw new AgentError("invalid-file", "Invalid PNG signature.");
    }
  }
  const type = String.fromCharCode(png[12], png[13], png[14], png[15]);
  if (type !== "IHDR") {
    throw new AgentError("invalid-file", `Invalid PNG: expected IHDR chunk, got ${type}.`);
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}
