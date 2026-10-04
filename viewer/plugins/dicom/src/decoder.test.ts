import { describe, expect, it } from "vitest";
import { inspectDicom, openDicom, readFrame, renderFrame, windowPixel } from "./decoder";
import { dicomFixture } from "./fixtures";
import { probeDicom } from "./probe";
import { MAX_HEADER_BYTES } from "./types";

const gray = (rgba: Uint8ClampedArray) => Array.from(rgba).filter((_, i) => i % 4 === 0);
const decode = (options: Parameters<typeof dicomFixture>[0] = {}) => {
  const bytes = dicomFixture(options);
  const source = inspectDicom(bytes, bytes.length);
  return { source, result: renderFrame(source, bytes.subarray(source.offset, source.offset + source.frameBytes)) };
};

describe("DICOM decoding", () => {
  it.each(["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"])("decodes native syntax %s", (syntax) => {
    const { source, result } = decode({ syntax });
    expect(source.info.reason).toBeUndefined();
    expect(gray(result.rgba)).toEqual([0, 85, 170, 255]);
    expect(result.rgba.filter((_, i) => i % 4 === 3)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]));
  });
  it("sign-extends stored bits, strips unused bits and applies rescale before windowing", () => {
    const { result } = decode({ stored: 12, highBit: 14, signed: true, pixels: [0x7ff8, 0, 800, 1600], slope: 2, intercept: -1000, center: -801, window: 403 });
    expect(gray(result.rgba)).toEqual([0, 2, 128, 255]);
  });
  it("inverts MONOCHROME1 and excludes padding from automatic windowing", () => {
    const { result } = decode({ photometric: "MONOCHROME1", padding: 65535, pixels: [65535, 100, 200, 300] });
    expect(gray(result.rgba)).toEqual([0, 255, 128, 0]);
  });
  it.each([0, 1])("renders RGB with planar configuration %s", (planar) => {
    const pixels = planar ? [10, 100, 20, 150, 30, 200] : [10, 20, 30, 100, 150, 200];
    const { result } = decode({ bits: 8, photometric: "RGB", samples: 3, width: 2, height: 1, planar, pixels });
    expect(Array.from(result.rgba)).toEqual([10, 20, 30, 255, 100, 150, 200, 255]);
  });
  it("reads one selected frame without reading the whole file", async () => {
    const bytes = dicomFixture({ frames: 2, pixels: [0, 100, 200, 300, 300, 200, 100, 0] });
    const file = new File([bytes], "test.dcm");
    const source = await openDicom(file);
    expect(gray((await readFrame(file, source, 1)).rgba)).toEqual([255, 170, 85, 0]);
    await expect(readFrame(file, source, 2)).rejects.toMatchObject({ code: "invalid-file" });
  });
  it("supports LINEAR, threshold, LINEAR_EXACT and SIGMOID window functions", () => {
    expect(windowPixel(0, { center: 0.5, width: 1 }, "LINEAR")).toBe(0);
    expect(windowPixel(1, { center: 0.5, width: 1 }, "LINEAR")).toBe(255);
    expect(windowPixel(100, { center: 100, width: 200 }, "LINEAR_EXACT")).toBe(127.5);
    expect(windowPixel(100, { center: 100, width: 200 }, "SIGMOID")).toBe(127.5);
    expect(windowPixel(1e5, { center: 100, width: 200 }, "LINEAR")).toBe(255);
  });
  it.each([
    [{ syntax: "1.2.840.10008.1.2.4.90" }, "syntax"],
    [{ syntax: "1.2.840.10008.1.2.1.99" }, "syntax"],
    [{ photometric: "PALETTE COLOR" }, "pixels"],
    [{ lut: true }, "transform"],
    [{ voi: "UNKNOWN" }, "transform"],
  ] as const)("retains metadata for unsupported image variants %o", (options, reason) => {
    const bytes = dicomFixture(options);
    expect(inspectDicom(bytes, bytes.length).info.reason).toBe(reason);
  });
  it("rejects invalid signatures, truncated pixels and invalid dimensions", () => {
    expect(() => inspectDicom(new Uint8Array(132), 132)).toThrow();
    const bytes = dicomFixture();
    expect(() => inspectDicom(bytes.subarray(0, bytes.length - 2), bytes.length - 2)).toThrow();
    const empty = dicomFixture({ width: 0 });
    expect(() => inspectDicom(empty, empty.length)).toThrow();
    const large = dicomFixture({ width: 65535, height: 65535 });
    expect(() => inspectDicom(large, large.length)).toThrow(expect.objectContaining({ code: "resource-limit" }));
  });
  it("limits header reads for large files", async () => {
    const bytes = dicomFixture();
    const calls: number[][] = [];
    const file = { size: 1024 ** 3, slice(start: number, end: number) { calls.push([start, end]); return new Blob([bytes]); } } as File;
    await openDicom(file);
    expect(calls).toEqual([[0, MAX_HEADER_BYTES]]);
  });
  it("uses a bounded header probe and respects cancellation", async () => {
    const file = new File([dicomFixture()], "scan.dcm");
    expect(await probeDicom({ file, signal: new AbortController().signal })).toBe(3);
    expect(await probeDicom({ file: new File(["invalid"], "scan.dcm"), signal: new AbortController().signal })).toBe(0);
    const controller = new AbortController(); controller.abort();
    await expect(probeDicom({ file, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
