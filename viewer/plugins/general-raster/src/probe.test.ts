import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { probeGeneralRaster } from "./probe";

function fixture(name: string) {
  return new File([readFileSync(join(process.cwd(), "examples", name))], name);
}

function classicTiff(bitsPerSample: number, sampleFormat: number, extraTags: number[] = []) {
  const entries = [
    [258, bitsPerSample],
    [259, 1],
    [262, 1],
    [339, sampleFormat],
    ...extraTags.map((tag) => [tag, 1]),
  ];
  const bytes = new Uint8Array(14 + entries.length * 12);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, value], index) => {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, 3, true);
    view.setUint32(offset + 4, 1, true);
    view.setUint16(offset + 8, value, true);
  });
  return new File([bytes], "sample.tiff");
}

describe("general raster probe", () => {
  it.each([
    "sample.tga",
    "sample-rle.tga",
    "sample.pbm",
    "sample.pgm",
    "sample.ppm",
    "sample.pam",
    "sample-alpha.pam",
    "sample-ascii.pbm",
    "sample-ascii.pgm",
    "sample-ascii.ppm",
    "sample-none.tiff",
    "sample-lzw.tiff",
    "sample-deflate.tiff",
    "sample-packbits.tiff",
    "sample-jpeg.tiff",
    "sample-tiled.tiff",
    "sample-multipage.tiff",
    "sample-16bit.tiff",
    "sample-alpha.tiff",
    "sample-oriented.tiff",
  ])("returns level 4 for the supported %s fixture", async (name) => {
    await expect(probeGeneralRaster({ file: fixture(name), signal: new AbortController().signal })).resolves.toBe(4);
  });

  it.each(["corrupt.tga", "corrupt.ppm", "corrupt.tiff", "truncated-sample.tga", "truncated-sample.ppm", "truncated-sample-lzw.tiff"])(
    "rejects malformed or incomplete %s",
    async (name) => {
      await expect(probeGeneralRaster({ file: fixture(name), signal: new AbortController().signal })).resolves.toBe(0);
    },
  );

  it("recognizes a valid BigTIFF header without loading a decoder", async () => {
    const bytes = new Uint8Array(36);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49]);
    view.setUint16(2, 43, true);
    view.setUint16(4, 8, true);
    view.setBigUint64(8, BigInt(16), true);
    view.setBigUint64(16, BigInt(0), true);
    const file = new File([bytes], "sample.btf");
    await expect(probeGeneralRaster({ file, signal: new AbortController().signal })).resolves.toBe(3);
  });

  it("accepts contiguous plain PBM bits", async () => {
    const file = new File(["P1\n4 2\n0011\n1100\n"], "contiguous.pbm");
    await expect(probeGeneralRaster({ file, signal: new AbortController().signal })).resolves.toBe(4);
  });

  it("marks PAM without TUPLTYPE as limited instead of claiming complete semantics", async () => {
    const file = new File(["P7\nWIDTH 1\nHEIGHT 1\nDEPTH 3\nMAXVAL 255\nENDHDR\n", new Uint8Array([1, 2, 3])], "unspecified.pam");
    await expect(probeGeneralRaster({ file, signal: new AbortController().signal })).resolves.toBe(3);
  });

  it.each([
    [32, 1],
    [32, 3],
    [16, 2],
  ])("rejects TIFF sample layouts the decoder cannot open (bits=%i, format=%i)", async (bits, format) => {
    await expect(probeGeneralRaster({ file: classicTiff(bits, format), signal: new AbortController().signal })).resolves.toBe(0);
  });

  it("marks TIFF with geospatial metadata as a limited pixel preview", async () => {
    const file = classicTiff(8, 1, [34735]);
    await expect(probeGeneralRaster({ file, signal: new AbortController().signal })).resolves.toBe(3);
  });
});
