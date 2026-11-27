// @vitest-environment node
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENDER_MAX_DIM,
  HARD_RENDER_MAX_DIM,
  encodePng,
  normalizeMaxDimension,
  readPngDimensions,
} from "./png";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function extractIdatBytes(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 8;
  while (offset + 12 <= png.byteLength) {
    const length = view.getUint32(offset, false);
    const type = Buffer.from(png.subarray(offset + 4, offset + 8)).toString("ascii");
    if (type === "IDAT") {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  return new Uint8Array(Buffer.concat(chunks));
}

describe("pure Node PNG encoder", () => {
  it("normalizes maxDimension with default 1600 and hard cap 4096", () => {
    expect(DEFAULT_RENDER_MAX_DIM).toBe(1600);
    expect(HARD_RENDER_MAX_DIM).toBe(4096);
    expect(normalizeMaxDimension(undefined)).toBe(1600);
    expect(normalizeMaxDimension(0)).toBe(1600);
    expect(normalizeMaxDimension(-10)).toBe(1600);
    expect(normalizeMaxDimension(Number.NaN)).toBe(1600);
    expect(normalizeMaxDimension(800.9)).toBe(800);
    expect(normalizeMaxDimension(9999)).toBe(4096);
  });

  it("encodes a valid RGBA PNG with exact pixels", () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,   0, 255, 0, 255,
      0, 0, 255, 255,   255, 255, 255, 128,
    ]);
    const png = encodePng({ width: 2, height: 2, data });

    expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect(readPngDimensions(png)).toEqual({ width: 2, height: 2 });

    const raw = inflateSync(extractIdatBytes(png));
    // Each scanline has 1 filter byte (0) + 2*4 RGBA bytes = 9 bytes.
    expect(raw.byteLength).toBe(18);
    expect(raw[0]).toBe(0);
    expect(Array.from(raw.subarray(1, 9))).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(raw[9]).toBe(0);
    expect(Array.from(raw.subarray(10, 18))).toEqual([0, 0, 255, 255, 255, 255, 255, 128]);
  });

  it("downscales oversized RgbaImage while preserving aspect ratio", () => {
    const width = 400;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 100;
      data[i + 1] = 150;
      data[i + 2] = 200;
      data[i + 3] = 255;
    }

    const png = encodePng({ width, height, data }, 100);
    const dims = readPngDimensions(png);
    expect(dims).toEqual({ width: 100, height: 50 });

    const raw = inflateSync(extractIdatBytes(png));
    // Verify decoded pixels are non-empty and match the uniform fill color.
    expect(raw[1]).toBe(100);
    expect(raw[2]).toBe(150);
    expect(raw[3]).toBe(200);
    expect(raw[4]).toBe(255);
  });

  it("rejects invalid dimensions or mismatched RGBA buffer length", () => {
    expect(() => encodePng({ width: 0, height: 10, data: new Uint8ClampedArray(0) })).toThrow();
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8ClampedArray(4) })).toThrow();
  });
});
