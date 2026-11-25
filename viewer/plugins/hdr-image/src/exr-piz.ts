import { ViewerError } from "@anyfile/viewer-protocol";
import type { ExrChannelLayout } from "./exr-compression";

const HUF_ENCBITS = 16;
const HUF_DECBITS = 14;
const HUF_ENCSIZE = (1 << HUF_ENCBITS) + 1;
const HUF_DECSIZE = 1 << HUF_DECBITS;
const HUF_DECMASK = HUF_DECSIZE - 1;
const SHORT_ZEROCODE_RUN = 59;
const LONG_ZEROCODE_RUN = 63;
const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;

interface HufDecEntry {
  len: number;
  lit: number;
  p: number[] | null;
}

function hufCanonicalCodeTable(hcode: Uint32Array): void {
  const n = new Uint32Array(59);
  for (let i = 0; i < HUF_ENCSIZE; i++) {
    const l = hcode[i];
    if (l < 59) n[l]++;
  }
  let c = 0;
  for (let i = 58; i > 0; i--) {
    const nc = (c + n[i]) >>> 1;
    n[i] = c;
    c = nc;
  }
  for (let i = 0; i < HUF_ENCSIZE; i++) {
    const l = hcode[i];
    if (l > 0) hcode[i] = l | (n[l]++ << 6);
  }
}

function hufBuildDecTable(hcode: Uint32Array, im: number, iM: number): HufDecEntry[] {
  const table: HufDecEntry[] = new Array(HUF_DECSIZE);
  for (let i = 0; i < HUF_DECSIZE; i++) table[i] = { len: 0, lit: 0, p: null };
  for (let sym = im; sym <= iM; sym++) {
    const code = hcode[sym] >>> 6;
    const len = hcode[sym] & 63;
    if (len === 0) continue;
    if (len > HUF_DECBITS) {
      const idx = code >>> (len - HUF_DECBITS);
      const entry = table[idx];
      if (!entry.p) entry.p = [];
      entry.p.push(sym);
      entry.lit++;
    } else {
      const shift = HUF_DECBITS - len;
      const start = code << shift;
      const count = 1 << shift;
      for (let j = 0; j < count; j++) {
        const entry = table[start + j];
        entry.len = len;
        entry.lit = sym;
      }
    }
  }
  return table;
}

function hufUncompress(src: Uint8Array, outLen: number): Uint16Array {
  if (src.byteLength < 20) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ Huffman header.");
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const im = view.getUint32(0, true);
  const iM = view.getUint32(4, true);
  const nBits = view.getUint32(12, true);
  if (im >= HUF_ENCSIZE || iM >= HUF_ENCSIZE || im > iM) {
    throw new ViewerError("invalid-file", "Invalid OpenEXR PIZ Huffman symbol bounds.");
  }

  const hcode = new Uint32Array(HUF_ENCSIZE);
  let bytePos = 20;
  let bitBuf = 0;
  let bitCount = 0;

  const getBits = (n: number): number => {
    while (bitCount < n) {
      if (bytePos >= src.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ Huffman table.");
      bitBuf = (bitBuf << 8) | src[bytePos++];
      bitCount += 8;
    }
    bitCount -= n;
    return (bitBuf >>> bitCount) & ((1 << n) - 1);
  };

  for (let sym = im; sym <= iM; sym++) {
    const l = getBits(6);
    if (l === LONG_ZEROCODE_RUN) {
      const zerun = getBits(8) + SHORTEST_LONG_RUN;
      if (sym + zerun > iM + 1) throw new ViewerError("invalid-file", "Invalid OpenEXR PIZ Huffman zero run.");
      sym += zerun - 1;
    } else if (l >= SHORT_ZEROCODE_RUN) {
      const zerun = l - SHORT_ZEROCODE_RUN + 2;
      if (sym + zerun > iM + 1) throw new ViewerError("invalid-file", "Invalid OpenEXR PIZ Huffman short zero run.");
      sym += zerun - 1;
    } else {
      hcode[sym] = l;
    }
  }

  hufCanonicalCodeTable(hcode);
  const decTable = hufBuildDecTable(hcode, im, iM);

  const out = new Uint16Array(outLen);
  let outPos = 0;
  const nBytes = (nBits + 7) >>> 3;
  if (bytePos + nBytes > src.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ Huffman bitstream.");

  let c = 0;
  let lc = 0;
  const endPos = bytePos + nBytes;
  let remainingBits = nBits;

  const ensureBits = (needed: number) => {
    while (lc < needed && bytePos < endPos) {
      c = ((c << 8) | src[bytePos++]) >>> 0;
      lc += 8;
    }
  };

  const emitCode = (sym: number) => {
    if (sym === iM) {
      ensureBits(8);
      if (lc < 8) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ RLE count.");
      lc -= 8;
      remainingBits -= 8;
      const runLen = (c >>> lc) & 0xff;
      if (outPos === 0 || outPos + runLen > outLen) throw new ViewerError("invalid-file", "Invalid OpenEXR PIZ RLE run.");
      out.fill(out[outPos - 1], outPos, outPos + runLen);
      outPos += runLen;
    } else {
      if (outPos >= outLen) throw new ViewerError("invalid-file", "OpenEXR PIZ output overflow.");
      out[outPos++] = sym;
    }
  };

  while (remainingBits > 0 && outPos < outLen) {
    ensureBits(HUF_DECBITS);
    if (lc >= HUF_DECBITS) {
      const entry = decTable[(c >>> (lc - HUF_DECBITS)) & HUF_DECMASK];
      if (entry.len > 0) {
        lc -= entry.len;
        remainingBits -= entry.len;
        emitCode(entry.lit);
      } else if (entry.p) {
        let matched = false;
        for (const sym of entry.p) {
          const codeLen = hcode[sym] & 63;
          const codeVal = hcode[sym] >>> 6;
          ensureBits(codeLen);
          if (lc >= codeLen && ((c >>> (lc - codeLen)) & ((1 << codeLen) - 1)) === codeVal) {
            lc -= codeLen;
            remainingBits -= codeLen;
            emitCode(sym);
            matched = true;
            break;
          }
        }
        if (!matched) throw new ViewerError("invalid-file", "Invalid OpenEXR PIZ long Huffman code.");
      } else {
        throw new ViewerError("invalid-file", "Invalid OpenEXR PIZ Huffman code.");
      }
    } else {
      const pad = HUF_DECBITS - lc;
      const idx = ((c & ((1 << lc) - 1)) << pad) & HUF_DECMASK;
      const entry = decTable[idx];
      if (entry.len > 0 && entry.len <= lc) {
        lc -= entry.len;
        remainingBits -= entry.len;
        emitCode(entry.lit);
      } else {
        break;
      }
    }
  }
  return out;
}

function wdec14(l: number, h: number): [number, number] {
  const ls = (l << 16) >> 16;
  const hi = (h << 16) >> 16;
  const ai = ls + (hi & 1) + (hi >> 1);
  return [ai & 0xffff, (ai - hi) & 0xffff];
}

function wdec16(l: number, h: number): [number, number] {
  const a = (l + (h & 1) + (h >> 1)) & 0xffff;
  return [a, (a - h) & 0xffff];
}

function wav2Decode(
  buffer: Uint16Array,
  baseOffset: number,
  nx: number,
  ox: number,
  ny: number,
  oy: number,
  maxValue: number,
): void {
  const use14 = maxValue < (1 << 14);
  const n = Math.min(nx, ny);
  let p = 1;
  let p2 = 2;
  while (p2 <= n) {
    p = p2;
    p2 <<= 1;
  }

  while (p >= 1) {
    const ey = oy * (ny - p2);
    const oy1 = oy * p;
    const oy2 = oy * p2;
    const ox1 = ox * p;
    const ox2 = ox * p2;

    for (let y = 0; y <= ey; y += oy2) {
      const ex = y + ox * (nx - p2);
      for (let x = y; x <= ex; x += ox2) {
        const i00 = baseOffset + x;
        const i01 = i00 + ox1;
        const i10 = i00 + oy1;
        const i11 = i10 + ox1;

        let [a00, a10] = use14 ? wdec14(buffer[i00], buffer[i10]) : wdec16(buffer[i00], buffer[i10]);
        let [a01, a11] = use14 ? wdec14(buffer[i01], buffer[i11]) : wdec16(buffer[i01], buffer[i11]);
        [a00, a01] = use14 ? wdec14(a00, a01) : wdec16(a00, a01);
        [a10, a11] = use14 ? wdec14(a10, a11) : wdec16(a10, a11);

        buffer[i00] = a00;
        buffer[i01] = a01;
        buffer[i10] = a10;
        buffer[i11] = a11;
      }
      if (nx & p) {
        const i00 = baseOffset + y + ox * (nx - p);
        const i10 = i00 + oy1;
        const [a00, a10] = use14 ? wdec14(buffer[i00], buffer[i10]) : wdec16(buffer[i00], buffer[i10]);
        buffer[i00] = a00;
        buffer[i10] = a10;
      }
    }
    if (ny & p) {
      const y = oy * (ny - p);
      const ex = y + ox * (nx - p2);
      for (let x = y; x <= ex; x += ox2) {
        const i00 = baseOffset + x;
        const i01 = i00 + ox1;
        const [a00, a01] = use14 ? wdec14(buffer[i00], buffer[i01]) : wdec16(buffer[i00], buffer[i01]);
        buffer[i00] = a00;
        buffer[i01] = a01;
      }
    }

    p2 = p;
    p >>= 1;
  }
}

export function decompressPiz(
  src: Uint8Array,
  rawSize: number,
  channels: readonly ExrChannelLayout[],
): Uint8Array {
  if (src.byteLength === rawSize) return src.slice();
  if (src.byteLength < 8) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ chunk.");
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const minNonZero = view.getUint16(0, true);
  const maxNonZero = view.getUint16(2, true);
  if (maxNonZero >= 8192) throw new ViewerError("invalid-file", "Invalid OpenEXR PIZ bitmap range.");

  let pos = 4;
  const bitmap = new Uint8Array(8192);
  if (minNonZero <= maxNonZero) {
    const mapLen = maxNonZero - minNonZero + 1;
    if (pos + mapLen > src.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ bitmap.");
    bitmap.set(src.subarray(pos, pos + mapLen), minNonZero);
    pos += mapLen;
  }

  const lut = new Uint16Array(65536);
  let k = 0;
  for (let i = 0; i < 65536; i++) {
    if (i === 0 || (bitmap[i >>> 3] & (1 << (i & 7))) !== 0) lut[k++] = i;
  }
  const maxValue = Math.max(0, k - 1);

  if (pos + 4 > src.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ Huffman length.");
  const huffLen = view.getUint32(pos, true);
  pos += 4;
  if (pos + huffLen > src.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR PIZ Huffman payload.");

  const decoded = hufUncompress(src.subarray(pos, pos + huffLen), rawSize >>> 1);

  let shortOffset = 0;
  for (const ch of channels) {
    const shortsPerSample = ch.byteSize >>> 1;
    for (let s = 0; s < shortsPerSample; s++) {
      wav2Decode(decoded, shortOffset + s, ch.nx, shortsPerSample, ch.ny, ch.nx * shortsPerSample, maxValue);
    }
    shortOffset += ch.nx * ch.ny * shortsPerSample;
  }

  for (let i = 0; i < decoded.length; i++) decoded[i] = lut[decoded[i]];

  const out = new Uint8Array(rawSize);
  const outView = new DataView(out.buffer);
  const maxNy = channels.reduce((m, c) => Math.max(m, c.ny), 0);
  const channelOffsets: number[] = [];
  let acc = 0;
  for (const ch of channels) {
    channelOffsets.push(acc);
    acc += ch.nx * ch.ny * (ch.byteSize >>> 1);
  }

  let byteOut = 0;
  for (let y = 0; y < maxNy; y++) {
    for (let ci = 0; ci < channels.length; ci++) {
      const ch = channels[ci];
      if (y >= ch.ny) continue;
      const shortsPerSample = ch.byteSize >>> 1;
      const rowBase = channelOffsets[ci] + y * ch.nx * shortsPerSample;
      const count = ch.nx * shortsPerSample;
      for (let i = 0; i < count; i++) {
        outView.setUint16(byteOut, decoded[rowBase + i], true);
        byteOut += 2;
      }
    }
  }
  return out;
}
