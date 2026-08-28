import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { decodeRaster } from "./decode";
import { decodeTga } from "./decode-tga";

function fixture(name: string) {
  return new File([readFileSync(join(process.cwd(), "examples", name))], name);
}

describe("general raster decoders", () => {
  it.each([
    ["sample.tga", "TGA", 1],
    ["sample-rle.tga", "TGA", 1],
    ["sample.pbm", "PBM", 1],
    ["sample.pgm", "PGM", 1],
    ["sample.ppm", "PPM", 1],
    ["sample.pam", "PAM", 1],
    ["sample-alpha.pam", "PAM", 1],
    ["sample-none.tiff", "TIFF", 1],
    ["sample-lzw.tiff", "TIFF", 1],
    ["sample-deflate.tiff", "TIFF", 1],
    ["sample-packbits.tiff", "TIFF", 1],
    ["sample-jpeg.tiff", "TIFF", 1],
    ["sample-tiled.tiff", "TIFF", 1],
    ["sample-multipage.tiff", "TIFF", 2],
    ["sample-16bit.tiff", "TIFF", 1],
    ["sample-alpha.tiff", "TIFF", 1],
  ] as const)("decodes the real %s fixture", async (name, format, pageCount) => {
    const raster = await decodeRaster(fixture(name), 0, new AbortController().signal);
    expect(raster).toMatchObject({ width: 96, height: 64, format, pageCount, orientationApplied: true });
    expect(raster.rgba).toHaveLength(96 * 64 * 4);
    expect(raster.rgba.some((value) => value !== 0)).toBe(true);
  });

  it("decodes the second TIFF page independently", async () => {
    const raster = await decodeRaster(fixture("sample-multipage.tiff"), 1, new AbortController().signal);
    expect(raster).toMatchObject({ pageIndex: 1, pageCount: 2, width: 96, height: 64 });
  });

  it.each([
    ["sample-ascii.pbm", "PBM", 2, 2],
    ["sample-ascii.pgm", "PGM", 2, 2],
    ["sample-ascii.ppm", "PPM", 2, 1],
  ] as const)("decodes the ASCII Netpbm fixture %s", async (name, format, width, height) => {
    const raster = await decodeRaster(fixture(name), 0, new AbortController().signal);
    expect(raster).toMatchObject({ format, width, height, bitDepth: expect.any(Number) });
    expect(raster.rgba).toHaveLength(width * height * 4);
  });

  it("decodes contiguous plain PBM bits as individual pixels", async () => {
    const file = new File(["P1\n4 2\n0011\n1100\n"], "contiguous.pbm");
    const raster = await decodeRaster(file, 0, new AbortController().signal);
    expect([...raster.rgba]).toEqual([
      255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);
  });

  it("decodes PAM with an unspecified tuple type by its common depth mapping", async () => {
    const file = new File(["P7\nWIDTH 1\nHEIGHT 1\nDEPTH 3\nMAXVAL 255\nENDHDR\n", new Uint8Array([1, 2, 3])], "unspecified.pam");
    const raster = await decodeRaster(file, 0, new AbortController().signal);
    expect([...raster.rgba]).toEqual([1, 2, 3, 255]);
  });

  it("preserves TIFF alpha and normalizes 16-bit samples to RGBA8", async () => {
    const alpha = await decodeRaster(fixture("sample-alpha.tiff"), 0, new AbortController().signal);
    const highDepth = await decodeRaster(fixture("sample-16bit.tiff"), 0, new AbortController().signal);
    expect(alpha.hasAlpha).toBe(true);
    expect(alpha.rgba[3]).toBeGreaterThan(0);
    expect(alpha.rgba[3]).toBeLessThan(255);
    expect(highDepth.bitDepth).toBe(16);
    expect(Math.max(...highDepth.rgba.slice(0, 256))).toBeGreaterThan(1);
  });

  it("preserves unpremultiplied PAM alpha", async () => {
    const alpha = await decodeRaster(fixture("sample-alpha.pam"), 0, new AbortController().signal);
    expect(alpha.hasAlpha).toBe(true);
    expect(alpha.rgba[3]).toBeGreaterThan(0);
    expect(alpha.rgba[3]).toBeLessThan(255);
  });

  it("applies TIFF orientation exactly once before returning pixels", async () => {
    const oriented = await decodeRaster(fixture("sample-oriented.tiff"), 0, new AbortController().signal);
    expect(oriented).toMatchObject({ width: 64, height: 96, orientation: 6, orientationApplied: true });
  });

  it("decodes TGA grayscale, palette, 16-bit color, and 32-bit alpha variants", () => {
    const header = (type: number, depth: number) => {
      const bytes = new Uint8Array(18);
      bytes[2] = type;
      bytes[12] = 2;
      bytes[14] = 1;
      bytes[16] = depth;
      bytes[17] = 0x20;
      return bytes;
    };
    const grayscaleHeader = header(3, 8);
    const grayscale = decodeTga(new Uint8Array([...grayscaleHeader, 0, 255]));
    expect([...grayscale.rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);

    const paletteHeader = header(1, 8);
    paletteHeader[1] = 1;
    paletteHeader[5] = 2;
    paletteHeader[7] = 24;
    const palette = decodeTga(new Uint8Array([...paletteHeader, 0, 0, 255, 255, 0, 0, 0, 1]));
    expect([...palette.rgba]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);

    const color16Header = header(2, 16);
    const color16 = decodeTga(new Uint8Array([...color16Header, 0xe0, 0x03, 0x00, 0x7c]));
    expect([...color16.rgba.slice(0, 3)]).toEqual([0, 255, 0]);
    expect([...color16.rgba.slice(4, 7)]).toEqual([255, 0, 0]);
    expect([color16.rgba[3], color16.rgba[7]]).toEqual([255, 255]);

    const alphaHeader = header(2, 32);
    alphaHeader[17] |= 8;
    const alpha = decodeTga(new Uint8Array([...alphaHeader, 0, 0, 255, 128, 255, 0, 0, 64]));
    expect(alpha.hasAlpha).toBe(true);
    expect([alpha.rgba[3], alpha.rgba[7]]).toEqual([128, 64]);
  });

  it.each(["corrupt.tga", "corrupt.ppm", "corrupt.tiff", "truncated-sample.tga", "truncated-sample.ppm", "truncated-sample-lzw.tiff"])(
    "rejects the invalid %s fixture",
    async (name) => {
      await expect(decodeRaster(fixture(name), 0, new AbortController().signal)).rejects.toMatchObject({ code: "invalid-file" });
    },
  );

  it("rejects an oversized decoded allocation before reading pixels", async () => {
    const header = new Uint8Array(18);
    header[2] = 2;
    header[12] = 0xff;
    header[13] = 0xff;
    header[14] = 0xff;
    header[15] = 0xff;
    header[16] = 24;
    expect(() => decodeTga(header)).toThrow(expect.objectContaining({ code: "resource-limit" }));
  });
});
