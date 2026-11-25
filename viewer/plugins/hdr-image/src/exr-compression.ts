import { ViewerError } from "@anyfile/viewer-protocol";
import { unzlibSync } from "fflate";
export { decompressPiz } from "./exr-piz";

export interface ExrChannelLayout {
  readonly pixelType: 0 | 1 | 2; // 0=UINT, 1=HALF, 2=FLOAT
  readonly byteSize: 2 | 4;
  readonly nx: number;
  readonly ny: number;
}

function reconstructAndInterleave(buf: Uint8Array): Uint8Array {
  const len = buf.byteLength;
  for (let i = 1; i < len; i++) {
    buf[i] = (buf[i - 1] + buf[i] - 128) & 0xff;
  }
  const out = new Uint8Array(len);
  const half = (len + 1) >> 1;
  let t1 = 0;
  let t2 = half;
  let s = 0;
  while (s < len) {
    out[s++] = buf[t1++];
    if (s < len) out[s++] = buf[t2++];
  }
  return out;
}

export function decompressRle(src: Uint8Array, rawSize: number): Uint8Array {
  if (src.byteLength === rawSize) return src.slice();
  const out = new Uint8Array(rawSize);
  let inPos = 0;
  let outPos = 0;
  while (inPos < src.byteLength && outPos < rawSize) {
    const rawCount = src[inPos++];
    const count = rawCount > 127 ? rawCount - 256 : rawCount;
    if (count < 0) {
      const len = -count;
      if (inPos + len > src.byteLength || outPos + len > rawSize) {
        throw new ViewerError("invalid-file", "Corrupt OpenEXR RLE literal run.");
      }
      out.set(src.subarray(inPos, inPos + len), outPos);
      inPos += len;
      outPos += len;
    } else {
      const len = count + 1;
      if (inPos >= src.byteLength || outPos + len > rawSize) {
        throw new ViewerError("invalid-file", "Corrupt OpenEXR RLE repeat run.");
      }
      out.fill(src[inPos++], outPos, outPos + len);
      outPos += len;
    }
  }
  if (outPos !== rawSize) throw new ViewerError("invalid-file", "Truncated OpenEXR RLE chunk.");
  return reconstructAndInterleave(out);
}

export function decompressZip(src: Uint8Array, rawSize: number): Uint8Array {
  if (src.byteLength === rawSize) return src.slice();
  let inflated: Uint8Array;
  try {
    inflated = unzlibSync(src);
  } catch (cause) {
    throw new ViewerError("invalid-file", "Failed to inflate OpenEXR ZIP chunk.", { cause });
  }
  if (inflated.byteLength !== rawSize) {
    throw new ViewerError("invalid-file", "Unexpected OpenEXR ZIP decompressed size.");
  }
  return reconstructAndInterleave(inflated);
}

export function decompressPxr24(
  src: Uint8Array,
  rawSize: number,
  channels: readonly ExrChannelLayout[],
  linesInChunk: number,
): Uint8Array {
  if (src.byteLength === rawSize) return src.slice();
  let inflated: Uint8Array;
  try {
    inflated = unzlibSync(src);
  } catch (cause) {
    throw new ViewerError("invalid-file", "Failed to inflate OpenEXR PXR24 chunk.", { cause });
  }
  const out = new Uint8Array(rawSize);
  let inPos = 0;
  let outPos = 0;

  for (let y = 0; y < linesInChunk; y++) {
    for (const ch of channels) {
      const n = ch.nx;
      if (ch.pixelType === 0) {
        if (inPos + n * 4 > inflated.byteLength) throw new ViewerError("invalid-file", "Truncated PXR24 UINT data.");
        const p0 = inPos, p1 = p0 + n, p2 = p1 + n, p3 = p2 + n;
        inPos += n * 4;
        let prev = 0;
        for (let i = 0; i < n; i++) {
          const diff = ((inflated[p0 + i] << 24) | (inflated[p1 + i] << 16) | (inflated[p2 + i] << 8) | inflated[p3 + i]) >>> 0;
          prev = (prev + diff) >>> 0;
          out[outPos++] = prev & 0xff;
          out[outPos++] = (prev >>> 8) & 0xff;
          out[outPos++] = (prev >>> 16) & 0xff;
          out[outPos++] = (prev >>> 24) & 0xff;
        }
      } else if (ch.pixelType === 1) {
        if (inPos + n * 2 > inflated.byteLength) throw new ViewerError("invalid-file", "Truncated PXR24 HALF data.");
        const p0 = inPos, p1 = p0 + n;
        inPos += n * 2;
        let prev = 0;
        for (let i = 0; i < n; i++) {
          prev = (prev + ((inflated[p0 + i] << 8) | inflated[p1 + i])) & 0xffff;
          out[outPos++] = prev & 0xff;
          out[outPos++] = (prev >>> 8) & 0xff;
        }
      } else {
        if (inPos + n * 3 > inflated.byteLength) throw new ViewerError("invalid-file", "Truncated PXR24 FLOAT data.");
        const p0 = inPos, p1 = p0 + n, p2 = p1 + n;
        inPos += n * 3;
        let prev = 0;
        for (let i = 0; i < n; i++) {
          const diff = (inflated[p0 + i] << 24) | (inflated[p1 + i] << 16) | (inflated[p2 + i] << 8);
          prev = (prev + diff) >>> 0;
          out[outPos++] = prev & 0xff;
          out[outPos++] = (prev >>> 8) & 0xff;
          out[outPos++] = (prev >>> 16) & 0xff;
          out[outPos++] = (prev >>> 24) & 0xff;
        }
      }
    }
  }
  return out;
}

function unpackB44Block(src: Uint8Array, pos: number, out: Uint16Array): number {
  if (pos + 3 <= src.byteLength && src[pos + 2] === 0xfc) {
    const raw = (src[pos] << 8) | src[pos + 1];
    out.fill((raw & 0x8000) !== 0 ? (raw & 0x7fff) : (~raw & 0xffff));
    return 3;
  }
  if (pos + 14 > src.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR B44 block.");
  const s = new Uint16Array(16);
  s[0] = (src[pos] << 8) | src[pos + 1];
  const shift = src[pos + 2] >>> 2;
  const bias = 0x20 << shift;

  s[4] = (s[0] + ((((src[pos + 2] << 4) | (src[pos + 3] >>> 4)) & 0x3f) << shift) - bias) & 0xffff;
  s[8] = (s[4] + ((((src[pos + 3] << 2) | (src[pos + 4] >>> 6)) & 0x3f) << shift) - bias) & 0xffff;
  s[12] = (s[8] + ((src[pos + 4] & 0x3f) << shift) - bias) & 0xffff;

  s[1] = (s[0] + ((src[pos + 5] >>> 2) << shift) - bias) & 0xffff;
  s[5] = (s[4] + ((((src[pos + 5] << 4) | (src[pos + 6] >>> 4)) & 0x3f) << shift) - bias) & 0xffff;
  s[9] = (s[8] + ((((src[pos + 6] << 2) | (src[pos + 7] >>> 6)) & 0x3f) << shift) - bias) & 0xffff;
  s[13] = (s[12] + ((src[pos + 7] & 0x3f) << shift) - bias) & 0xffff;

  s[2] = (s[1] + ((src[pos + 8] >>> 2) << shift) - bias) & 0xffff;
  s[6] = (s[5] + ((((src[pos + 8] << 4) | (src[pos + 9] >>> 4)) & 0x3f) << shift) - bias) & 0xffff;
  s[10] = (s[9] + ((((src[pos + 9] << 2) | (src[pos + 10] >>> 6)) & 0x3f) << shift) - bias) & 0xffff;
  s[14] = (s[13] + ((src[pos + 10] & 0x3f) << shift) - bias) & 0xffff;

  s[3] = (s[2] + ((src[pos + 11] >>> 2) << shift) - bias) & 0xffff;
  s[7] = (s[6] + ((((src[pos + 11] << 4) | (src[pos + 12] >>> 4)) & 0x3f) << shift) - bias) & 0xffff;
  s[11] = (s[10] + ((((src[pos + 12] << 2) | (src[pos + 13] >>> 6)) & 0x3f) << shift) - bias) & 0xffff;
  s[15] = (s[14] + ((src[pos + 13] & 0x3f) << shift) - bias) & 0xffff;

  for (let i = 0; i < 16; i++) {
    const v = s[i];
    out[i] = (v & 0x8000) !== 0 ? (v & 0x7fff) : (~v & 0xffff);
  }
  return 14;
}

export function decompressB44(
  src: Uint8Array,
  rawSize: number,
  channels: readonly ExrChannelLayout[],
): Uint8Array {
  if (src.byteLength === rawSize) return src.slice();
  const out = new Uint8Array(rawSize);
  const outView = new DataView(out.buffer);
  const rowStride = channels.reduce((s, c) => s + c.nx * c.byteSize, 0);
  const chRowOffset: number[] = [];
  let off = 0;
  for (const ch of channels) {
    chRowOffset.push(off);
    off += ch.nx * ch.byteSize;
  }

  let inPos = 0;
  const block = new Uint16Array(16);

  for (let ci = 0; ci < channels.length; ci++) {
    const ch = channels[ci];
    if (ch.pixelType !== 1) {
      const rowBytes = ch.nx * ch.byteSize;
      for (let y = 0; y < ch.ny; y++) {
        if (inPos + rowBytes > src.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR B44 channel.");
        out.set(src.subarray(inPos, inPos + rowBytes), y * rowStride + chRowOffset[ci]);
        inPos += rowBytes;
      }
      continue;
    }

    for (let y = 0; y < ch.ny; y += 4) {
      for (let x = 0; x < ch.nx; x += 4) {
        inPos += unpackB44Block(src, inPos, block);
        const yEnd = Math.min(4, ch.ny - y);
        const xEnd = Math.min(4, ch.nx - x);
        for (let by = 0; by < yEnd; by++) {
          const dstRow = (y + by) * rowStride + chRowOffset[ci] + x * 2;
          for (let bx = 0; bx < xEnd; bx++) {
            outView.setUint16(dstRow + bx * 2, block[by * 4 + bx], true);
          }
        }
      }
    }
  }
  return out;
}
