import { ViewerError } from "@anyfile/viewer-protocol";

import type { InsvEmbeddedPreview } from "./insv-metadata";
import { readBlob } from "./read-blob";

const HEADER_BYTES = 40;

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export function yuv420ToRgba(bytes: Uint8Array, width: number, height: number) {
  const pixels = width * height;
  if (width <= 0 || height <= 0 || width % 2 !== 0 || height % 2 !== 0
    || bytes.length !== pixels * 3 / 2) throw new Error("Invalid YUV420 preview.");
  const rgba = new Uint8ClampedArray(pixels * 4);
  const uOffset = pixels;
  const vOffset = pixels + pixels / 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = y * width + x;
      const chroma = Math.floor(y / 2) * (width / 2) + Math.floor(x / 2);
      const luma = Math.max(0, bytes[source] - 16) * 1.164;
      const u = bytes[uOffset + chroma] - 128;
      const v = bytes[vOffset + chroma] - 128;
      const target = source * 4;
      rgba[target] = clampByte(luma + 1.793 * v);
      rgba[target + 1] = clampByte(luma - 0.213 * u - 0.533 * v);
      rgba[target + 2] = clampByte(luma + 2.112 * u);
      rgba[target + 3] = 255;
    }
  }
  return rgba;
}

export async function decodeEmbeddedPreview(
  file: File,
  preview: InsvEmbeddedPreview,
  signal: AbortSignal,
  invalidMessage: string,
) {
  const bytes = await readBlob(file.slice(preview.offset, preview.offset + preview.size), signal);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadBytes = preview.width * preview.height * 3 / 2;
  if (bytes.length !== HEADER_BYTES + payloadBytes || view.getUint32(0, true) !== 1
    || view.getUint32(4, true) !== preview.size || view.getUint32(8, true) !== 1
    || view.getUint32(16, true) !== preview.width || view.getUint32(20, true) !== preview.height) {
    throw new ViewerError("invalid-file", invalidMessage);
  }
  const rgba = yuv420ToRgba(bytes.subarray(HEADER_BYTES), preview.width, preview.height);
  return createImageBitmap(new ImageData(rgba, preview.width, preview.height), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
}
