/// <reference lib="webworker" />

import type { X6DngWorkerRequest, X6DngWorkerResponse } from "./x6-dng-types";

const worker = self as unknown as DedicatedWorkerGlobalScope;
const WIDTH = 15_520;
const HEIGHT = 7_760;
const WHITE_LEVEL = 16_383;
const EXPOSURE = 2 ** 2.412140131;
const RED_BALANCE = 1 / 0.4384765625;
const BLUE_BALANCE = 1 / 0.5966796875;

interface TiffData {
  readonly view: DataView;
  readonly littleEndian: boolean;
  readonly rowsPerStrip: number;
  readonly stripOffsets: readonly number[];
  readonly stripByteCounts: readonly number[];
}

function readValues(view: DataView, littleEndian: boolean, entry: number) {
  const type = view.getUint16(entry + 2, littleEndian);
  const count = view.getUint32(entry + 4, littleEndian);
  const size = type === 1 ? 1 : type === 3 ? 2 : type === 4 ? 4 : 0;
  if (size === 0 || count > 1024) return undefined;
  const bytes = count * size;
  const offset = bytes <= 4 ? entry + 8 : view.getUint32(entry + 8, littleEndian);
  if (offset < 0 || offset + bytes > view.byteLength) return undefined;
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const position = offset + index * size;
    values.push(type === 1 ? view.getUint8(position)
      : type === 3 ? view.getUint16(position, littleEndian)
        : view.getUint32(position, littleEndian));
  }
  return values;
}

export function parseX6DeflateDng(bytes: ArrayBuffer): TiffData {
  const view = new DataView(bytes);
  const littleEndian = view.getUint8(0) === 0x49 && view.getUint8(1) === 0x49;
  if (!littleEndian || view.getUint16(2, true) !== 42) throw new Error("Invalid little-endian TIFF header.");
  const directory = view.getUint32(4, true);
  if (directory + 2 > view.byteLength) throw new Error("Invalid TIFF directory offset.");
  const count = view.getUint16(directory, true);
  if (count > 512 || directory + 2 + count * 12 > view.byteLength) throw new Error("Invalid TIFF directory.");
  const tags = new Map<number, number[]>();
  for (let index = 0; index < count; index += 1) {
    const entry = directory + 2 + index * 12;
    const values = readValues(view, littleEndian, entry);
    if (values) tags.set(view.getUint16(entry, littleEndian), values);
  }
  const one = (tag: number) => tags.get(tag)?.[0];
  const offsets = tags.get(0x0111);
  const byteCounts = tags.get(0x0117);
  const rowsPerStrip = one(0x0116);
  const cfa = tags.get(0x828e);
  if (one(0x0100) !== WIDTH || one(0x0101) !== HEIGHT || one(0x0102) !== 16
    || one(0x0103) !== 8 || one(0x0115) !== 1 || one(0x013d) !== undefined && one(0x013d) !== 1
    || !rowsPerStrip || !offsets || !byteCounts || offsets.length !== byteCounts.length
    || offsets.length !== Math.ceil(HEIGHT / rowsPerStrip) || cfa?.join(",") !== "1,2,0,1") {
    throw new Error("Unsupported X6 DNG pixel layout.");
  }
  for (let index = 0; index < offsets.length; index += 1) {
    if (byteCounts[index] <= 0 || offsets[index] + byteCounts[index] > bytes.byteLength) {
      throw new Error("Invalid X6 DNG strip range.");
    }
  }
  return { view, littleEndian, rowsPerStrip, stripOffsets: offsets, stripByteCounts: byteCounts };
}

async function inflate(bytes: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function tone(value: number, balance: number) {
  const linear = Math.min(1, Math.max(0, value * balance * EXPOSURE / WHITE_LEVEL));
  const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

async function decode(file: File) {
  const bytes = await file.arrayBuffer();
  const tiff = parseX6DeflateDng(bytes);
  const outputWidth = WIDTH / 2;
  const outputHeight = HEIGHT / 2;
  const rgba = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let strip = 0, firstRow = 0; strip < tiff.stripOffsets.length; strip += 1, firstRow += tiff.rowsPerStrip) {
    const rowCount = Math.min(tiff.rowsPerStrip, HEIGHT - firstRow);
    const compressed = new Uint8Array(bytes, tiff.stripOffsets[strip], tiff.stripByteCounts[strip]);
    const raw = await inflate(compressed);
    if (raw.byteLength !== rowCount * WIDTH * 2) throw new Error("Unexpected X6 DNG strip size.");
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let row = 0; row < rowCount; row += 2) {
      const top = row * WIDTH * 2;
      const bottom = top + WIDTH * 2;
      let target = ((firstRow + row) / 2) * outputWidth * 4;
      for (let column = 0; column < WIDTH; column += 2, target += 4) {
        const green = (view.getUint16(top + column * 2, tiff.littleEndian)
          + view.getUint16(bottom + (column + 1) * 2, tiff.littleEndian)) / 2;
        rgba[target] = tone(view.getUint16(bottom + column * 2, tiff.littleEndian), RED_BALANCE);
        rgba[target + 1] = tone(green, 1);
        rgba[target + 2] = tone(view.getUint16(top + (column + 1) * 2, tiff.littleEndian), BLUE_BALANCE);
        rgba[target + 3] = 255;
      }
    }
  }
  return createImageBitmap(new ImageData(rgba, outputWidth, outputHeight), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
}

worker.addEventListener("message", async (event: MessageEvent<X6DngWorkerRequest>) => {
  try {
    const bitmap = await decode(event.data.file);
    const response: X6DngWorkerResponse = { type: "decoded", bitmap };
    worker.postMessage(response, [bitmap]);
  } catch (error) {
    const response: X6DngWorkerResponse = {
      type: "error",
      message: error instanceof Error ? error.message : "X6 DNG decode failed.",
    };
    worker.postMessage(response);
  }
});
