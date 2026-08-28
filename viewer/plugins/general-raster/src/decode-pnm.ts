import { ViewerError } from "@anyfile/viewer-protocol";

import { checkedPixelCount } from "./limits";
import type { DecodedRaster, RasterFormat } from "./types";

function invalid(message = "Netpbm 文件损坏或使用了不支持的变体。"): never {
  throw new ViewerError("invalid-file", message);
}

class Tokens {
  position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  next() {
    this.skip();
    const start = this.position;
    while (this.position < this.bytes.length && this.bytes[this.position] > 0x20 && this.bytes[this.position] !== 0x23) {
      this.position += 1;
    }
    if (start === this.position) invalid();
    return new TextDecoder("ascii", { fatal: true }).decode(this.bytes.subarray(start, this.position));
  }

  nextNumber() {
    this.skip();
    if (this.position >= this.bytes.length) invalid();
    let value = 0;
    const start = this.position;
    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position];
      if (byte <= 0x20 || byte === 0x23) break;
      if (byte < 0x30 || byte > 0x39) invalid();
      value = value * 10 + byte - 0x30;
      if (!Number.isSafeInteger(value)) invalid();
      this.position += 1;
    }
    if (start === this.position) invalid();
    return value;
  }

  nextBit() {
    this.skip();
    const value = this.bytes[this.position++];
    if (value !== 0x30 && value !== 0x31) invalid();
    return value - 0x30;
  }

  binaryOffset() {
    if (this.position >= this.bytes.length || this.bytes[this.position] > 0x20) invalid();
    if (this.bytes[this.position++] === 0x0d && this.bytes[this.position] === 0x0a) this.position += 1;
    return this.position;
  }

  private skip() {
    while (this.position < this.bytes.length) {
      if (this.bytes[this.position] === 0x23) {
        while (this.position < this.bytes.length && this.bytes[this.position] !== 0x0a && this.bytes[this.position] !== 0x0d) this.position += 1;
      } else if (this.bytes[this.position] <= 0x20) {
        this.position += 1;
      } else {
        break;
      }
    }
  }
}

function sampleToByte(value: number, maximum: number) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) invalid();
  return Math.round((value * 255) / maximum);
}

function decodePam(bytes: Uint8Array): DecodedRaster {
  let offset = 3;
  const values = new Map<string, string>();
  while (offset < bytes.length) {
    const lineEnd = bytes.indexOf(0x0a, offset);
    if (lineEnd < 0) invalid();
    const line = new TextDecoder("ascii", { fatal: true }).decode(bytes.subarray(offset, lineEnd)).trim();
    offset = lineEnd + 1;
    if (!line || line.startsWith("#")) continue;
    if (line === "ENDHDR") break;
    const separator = line.search(/\s/);
    if (separator < 1) invalid();
    values.set(line.slice(0, separator), line.slice(separator).trim());
  }
  if (!values.has("WIDTH") || !values.has("HEIGHT") || !values.has("DEPTH") || !values.has("MAXVAL")) invalid();
  const width = Number(values.get("WIDTH"));
  const height = Number(values.get("HEIGHT"));
  const depth = Number(values.get("DEPTH"));
  const maximum = Number(values.get("MAXVAL"));
  const tuple = values.get("TUPLTYPE") ?? "";
  const channelsByTuple: Record<string, number> = {
    BLACKANDWHITE: 1,
    GRAYSCALE: 1,
    RGB: 3,
    BLACKANDWHITE_ALPHA: 2,
    GRAYSCALE_ALPHA: 2,
    RGB_ALPHA: 4,
  };
  if ((tuple && channelsByTuple[tuple] !== depth) || ![1, 2, 3, 4].includes(depth) || !Number.isInteger(maximum) || maximum < 1 || maximum > 65535) invalid();
  const pixels = checkedPixelCount(width, height);
  const bytesPerSample = maximum < 256 ? 1 : 2;
  const required = pixels * depth * bytesPerSample;
  if (!Number.isSafeInteger(required) || offset + required !== bytes.length) invalid();
  const rgba = new Uint8ClampedArray(pixels * 4);
  let source = offset;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const output = pixel * 4;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 255;
    for (let channel = 0; channel < depth; channel += 1) {
      const value = bytesPerSample === 1 ? bytes[source] : (bytes[source] << 8) | bytes[source + 1];
      source += bytesPerSample;
      const sample = sampleToByte(value, maximum);
      if (depth <= 2) {
        if (channel === 0) red = green = blue = sample;
        else alpha = sample;
      } else if (channel === 0) red = sample;
      else if (channel === 1) green = sample;
      else if (channel === 2) blue = sample;
      else alpha = sample;
    }
    rgba[output] = red;
    rgba[output + 1] = green;
    rgba[output + 2] = blue;
    rgba[output + 3] = alpha;
  }
  return result("PAM", width, height, rgba, maximum > 255 ? 16 : maximum === 1 ? 1 : 8, depth === 2 || depth === 4);
}

function result(format: RasterFormat, width: number, height: number, rgba: Uint8ClampedArray, bitDepth: number, hasAlpha: boolean): DecodedRaster {
  return { width, height, rgba, format, bitDepth, hasAlpha, colorSpace: "unknown", orientation: 1, orientationApplied: true, icc: "none", pageIndex: 0, pageCount: 1, tiled: false, compression: "none" };
}

export function decodePnm(bytes: Uint8Array): DecodedRaster {
  if (bytes.length < 3 || bytes[0] !== 0x50 || bytes[1] < 0x31 || bytes[1] > 0x37) invalid();
  if (bytes[1] === 0x37) return decodePam(bytes);
  const kind = bytes[1] - 0x30;
  const tokens = new Tokens(bytes);
  if (tokens.next() !== `P${kind}`) invalid();
  const width = Number(tokens.next());
  const height = Number(tokens.next());
  const pixels = checkedPixelCount(width, height);
  const bitmap = kind === 1 || kind === 4;
  const maximum = bitmap ? 1 : Number(tokens.next());
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 65535) invalid();
  const channels = kind === 3 || kind === 6 ? 3 : 1;
  const rgba = new Uint8ClampedArray(pixels * 4);
  const binary = kind >= 4;
  let offset = binary ? tokens.binaryOffset() : 0;
  const bytesPerSample = maximum < 256 ? 1 : 2;
  if (kind === 4) {
    const rowBytes = Math.ceil(width / 8);
    if (offset + rowBytes * height !== bytes.length) invalid();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = (bytes[offset + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const gray = value ? 0 : 255;
        const output = (y * width + x) * 4;
        rgba[output] = gray;
        rgba[output + 1] = gray;
        rgba[output + 2] = gray;
        rgba[output + 3] = 255;
      }
    }
  } else {
    if (binary && offset + pixels * channels * bytesPerSample !== bytes.length) invalid();
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const output = pixel * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        let value: number;
        if (binary) {
          value = bytesPerSample === 1 ? bytes[offset] : (bytes[offset] << 8) | bytes[offset + 1];
          offset += bytesPerSample;
        } else value = kind === 1 ? tokens.nextBit() : tokens.nextNumber();
        const sample = bitmap ? (value ? 0 : 255) : sampleToByte(value, maximum);
        if (channels === 1) red = green = blue = sample;
        else if (channel === 0) red = sample;
        else if (channel === 1) green = sample;
        else blue = sample;
      }
      rgba[output] = red;
      rgba[output + 1] = green;
      rgba[output + 2] = blue;
      rgba[output + 3] = 255;
    }
  }
  const format: RasterFormat = bitmap ? "PBM" : channels === 1 ? "PGM" : "PPM";
  return result(format, width, height, rgba, maximum > 255 ? 16 : bitmap ? 1 : 8, false);
}
