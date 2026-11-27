import { inflateSync } from "node:zlib";

/** Node-only decoder for the non-interlaced PNGs jxl-oxide emits (gray/RGB ± alpha, 8 or 16 bit) to RGBA8. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly hasAlpha: boolean;
  readonly rgba: Uint8ClampedArray;
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(png: Uint8Array): DecodedPng {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  for (let at = 8; at + 8 <= png.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("Interlaced PNG output is not supported.");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  const channels = CHANNELS[colorType];
  if (!channels || (bitDepth !== 8 && bitDepth !== 16) || width === 0 || height === 0) {
    throw new Error(`Unsupported PNG layout (color type ${colorType}, ${bitDepth}-bit).`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = channels * (bitDepth / 8);
  const stride = width * bytesPerPixel;
  if (raw.length < (stride + 1) * height) throw new Error("PNG pixel data is truncated.");

  const rgba = new Uint8ClampedArray(width * height * 4);
  let previous = new Uint8Array(stride);
  let current = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : 0;
      current[x] = (line[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const sample = (channel: number) => current[(x * channels + channel) * (bitDepth / 8)];
      const out = (y * width + x) * 4;
      const gray = channels <= 2;
      rgba[out] = sample(0);
      rgba[out + 1] = gray ? sample(0) : sample(1);
      rgba[out + 2] = gray ? sample(0) : sample(2);
      rgba[out + 3] = channels === 2 ? sample(1) : channels === 4 ? sample(3) : 255;
    }
    [previous, current] = [current, previous];
  }
  return { width, height, bitDepth, hasAlpha: channels === 2 || channels === 4, rgba };
}
