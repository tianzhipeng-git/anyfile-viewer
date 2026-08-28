import { ViewerError } from "@anyfile/viewer-protocol";

import { checkedPixelCount } from "./limits";
import type { DecodedRaster } from "./types";

function invalid(message = "TGA 文件损坏或使用了不支持的变体。"): never {
  throw new ViewerError("invalid-file", message);
}

function expand5Bit(sample: number) {
  return (sample << 3) | (sample >> 2);
}

function readColor(bytes: Uint8Array, offset: number, depth: number, target: Uint8ClampedArray, targetOffset: number, alpha16 = false) {
  if (offset + Math.ceil(depth / 8) > bytes.length) invalid();
  if (depth === 32 || depth === 24) {
    target[targetOffset] = bytes[offset + 2];
    target[targetOffset + 1] = bytes[offset + 1];
    target[targetOffset + 2] = bytes[offset];
    target[targetOffset + 3] = depth === 32 ? bytes[offset + 3] : 255;
  } else if (depth === 15 || depth === 16) {
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    target[targetOffset] = expand5Bit((value >> 10) & 31);
    target[targetOffset + 1] = expand5Bit((value >> 5) & 31);
    target[targetOffset + 2] = expand5Bit(value & 31);
    target[targetOffset + 3] = alpha16 ? ((value & 0x8000) ? 255 : 0) : 255;
  } else invalid();
}

export function decodeTga(bytes: Uint8Array): DecodedRaster {
  if (bytes.length < 18) invalid();
  const idLength = bytes[0];
  const colorMapType = bytes[1];
  const imageType = bytes[2];
  const colorMapped = imageType === 1 || imageType === 9;
  const trueColor = imageType === 2 || imageType === 10;
  const grayscale = imageType === 3 || imageType === 11;
  const rle = imageType >= 9;
  if (!colorMapped && !trueColor && !grayscale) invalid();
  if ((colorMapped && colorMapType !== 1) || (!colorMapped && colorMapType !== 0)) invalid();

  const colorMapFirst = bytes[3] | (bytes[4] << 8);
  const colorMapLength = bytes[5] | (bytes[6] << 8);
  const colorMapDepth = bytes[7];
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  const descriptor = bytes[17];
  const pixels = checkedPixelCount(width, height);
  if (trueColor && ![15, 16, 24, 32].includes(depth)) invalid();
  if (grayscale && ![8, 16].includes(depth)) invalid();
  if (colorMapped && (!colorMapLength || ![8, 16].includes(depth) || ![15, 16, 24, 32].includes(colorMapDepth))) invalid();

  let offset = 18 + idLength;
  const palette = new Uint8ClampedArray(colorMapLength * 4);
  if (colorMapped) {
    const entryBytes = Math.ceil(colorMapDepth / 8);
    for (let index = 0; index < colorMapLength; index += 1) {
      readColor(bytes, offset, colorMapDepth, palette, index * 4, (descriptor & 0x0f) > 0);
      offset += entryBytes;
    }
  }
  if (offset > bytes.length) invalid();

  const sourceBytes = Math.ceil(depth / 8);
  const rgba = new Uint8ClampedArray(pixels * 4);
  const topOrigin = (descriptor & 0x20) !== 0;
  const rightOrigin = (descriptor & 0x10) !== 0;
  const color = new Uint8ClampedArray(4);
  let decoded = 0;

  const readPixel = () => {
    if (colorMapped) {
      if (offset + sourceBytes > bytes.length) invalid();
      const paletteIndex = sourceBytes === 1 ? bytes[offset] : bytes[offset] | (bytes[offset + 1] << 8);
      const paletteOffset = (paletteIndex - colorMapFirst) * 4;
      if (paletteOffset < 0 || paletteOffset + 4 > palette.length) invalid();
      color[0] = palette[paletteOffset];
      color[1] = palette[paletteOffset + 1];
      color[2] = palette[paletteOffset + 2];
      color[3] = palette[paletteOffset + 3];
    } else if (grayscale) {
      if (offset + sourceBytes > bytes.length) invalid();
      color[0] = bytes[offset];
      color[1] = bytes[offset];
      color[2] = bytes[offset];
      color[3] = depth === 16 ? bytes[offset + 1] : 255;
    } else readColor(bytes, offset, depth, color, 0, (descriptor & 0x0f) > 0);
    offset += sourceBytes;
  };

  const writePixel = () => {
    if (decoded >= pixels) invalid();
    const sourceX = decoded % width;
    const sourceY = Math.floor(decoded / width);
    const x = rightOrigin ? width - 1 - sourceX : sourceX;
    const y = topOrigin ? sourceY : height - 1 - sourceY;
    const output = (y * width + x) * 4;
    rgba[output] = color[0];
    rgba[output + 1] = color[1];
    rgba[output + 2] = color[2];
    rgba[output + 3] = color[3];
    decoded += 1;
  };

  while (decoded < pixels) {
    if (!rle) {
      readPixel();
      writePixel();
      continue;
    }
    if (offset >= bytes.length) invalid();
    const packet = bytes[offset++];
    const count = (packet & 0x7f) + 1;
    if (decoded + count > pixels) invalid();
    if (packet & 0x80) {
      readPixel();
      for (let index = 0; index < count; index += 1) writePixel();
    } else {
      for (let index = 0; index < count; index += 1) {
        readPixel();
        writePixel();
      }
    }
  }

  return {
    width,
    height,
    rgba,
    format: "TGA",
    bitDepth: depth,
    hasAlpha: depth === 32 || (depth === 16 && (grayscale || (descriptor & 0x0f) > 0)),
    colorSpace: "unknown",
    orientation: 1,
    orientationApplied: true,
    icc: "none",
    pageIndex: 0,
    pageCount: 1,
    tiled: false,
    compression: rle ? "RLE" : "none",
  };
}
