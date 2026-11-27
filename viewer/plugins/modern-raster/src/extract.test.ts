// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import type { ExtractContext, RgbaImage } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";
import { buildExifTiff, heifWithExif, jxlWithExif } from "./test-fixtures";

const EXAMPLES = resolve(__dirname, "../examples");
const example = (name: string) => new Uint8Array(readFileSync(resolve(EXAMPLES, name)));

function makeContext(name: string, bytes: Uint8Array): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([new Uint8Array(bytes)], name),
    vendor: createNodeVendorAssets(),
    signal: new AbortController().signal,
  };
}

function pixel(image: RgbaImage, x: number, y: number) {
  const at = (y * image.width + x) * 4;
  return [...image.data.subarray(at, at + 4)];
}

describe("modern-raster ./extract", () => {
  it("passes extractor compliance on real JXL and HEIC examples", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "sample-lossy.jxl", filePath: resolve(EXAMPLES, "sample-lossy.jxl"), invalidBytes: example("corrupt.jxl"), filter: "width", smallMaxBytes: 60 },
      { name: "sample-lossless-alpha.jxl", filePath: resolve(EXAMPLES, "sample-lossless-alpha.jxl"), invalidBytes: example("truncated.jxl") },
      { name: "animated.jxl", filePath: resolve(EXAMPLES, "animated.jxl"), targetId: "frame:1" },
      { name: "sample.heic", filePath: resolve(EXAMPLES, "sample.heic"), invalidBytes: example("truncated.heic"), filter: "brands", smallMaxBytes: 60 },
    ]);
  }, 60_000);

  it("reports JXL dimensions, alpha and animation and renders real pixels", async () => {
    const lossy = makeContext("sample-lossy.jxl", example("sample-lossy.jxl"));
    expect((await extractor.inspect(lossy)).metadata).toMatchObject({ format: "JPEG XL", width: 96, height: 64, bitDepth: 8, hasAlpha: false, animated: false });
    const gradient = await extractor.renderImage!(lossy, { maxDimension: 1600 });
    expect([gradient.width, gradient.height]).toEqual([96, 64]);
    const [r, , b] = pixel(gradient, 0, 0);
    expect(b).toBeGreaterThan(r); // #2255aa at the top
    expect(pixel(gradient, 48, 63)[0]).toBeGreaterThan(200); // #f5c451 at the bottom

    const alpha = makeContext("sample-lossless-alpha.jxl", example("sample-lossless-alpha.jxl"));
    expect((await extractor.inspect(alpha)).metadata).toMatchObject({ hasAlpha: true });
    const circle = await extractor.renderImage!(alpha, { maxDimension: 1600 });
    expect(pixel(circle, 0, 0)[3]).toBe(0);
    expect(pixel(circle, 48, 32)).toEqual([0x32, 0xa8, 0x52, 0xaa]);

    const animated = makeContext("animated.jxl", example("animated.jxl"));
    const inspected = await extractor.inspect(animated);
    expect(inspected.metadata).toMatchObject({ animated: true, frameCount: 2 });
    expect(inspected.targets.map((target) => target.id)).toEqual(["metadata", "frame:0", "frame:1"]);
    expect(pixel(await extractor.renderImage!(animated, { maxDimension: 32 }), 4, 4).slice(0, 3)).toEqual([0xd4, 0x3f, 0x3a]);
    const blue = await extractor.renderImage!(animated, { target: "frame:1", maxDimension: 32 });
    expect([blue.width, blue.height]).toEqual([32, 21]);
    expect(pixel(blue, 4, 4).slice(0, 3)).toEqual([0x34, 0x67, 0xd6]);
    await expect(extractor.renderImage!(animated, { target: "frame:2", maxDimension: 32 })).rejects.toMatchObject({ code: "target-not-found" });
    await expect(extractor.renderImage!(animated, { maxDimension: 0 })).rejects.toMatchObject({ code: "invalid-argument" });
  }, 30_000);

  it("decodes the HEIC primary image through vendored libheif", async () => {
    const context = makeContext("sample.heic", example("sample.heic"));
    expect((await extractor.inspect(context)).metadata).toMatchObject({
      format: "HEIC", width: 96, height: 64, bitDepth: 10, hasAlpha: false, imageCount: 1, primaryCodec: "hvc1", colorProfile: "nclx",
    });
    const image = await extractor.renderImage!(context, { maxDimension: 48 });
    expect([image.width, image.height]).toEqual([48, 32]);
    const [r, , b] = pixel(image, 24, 0);
    expect(b).toBeGreaterThan(r);
    expect(pixel(image, 24, 31)[0]).toBeGreaterThan(200);
  }, 30_000);

  it("summarizes EXIF from HEIF items and JXL boxes", async () => {
    const tiff = buildExifTiff();
    const expected = { make: "Anyfile", model: "Test Cam 1", orientation: 6, iso: 400, fNumber: 2.8, dateTimeOriginal: "2024:05:06 07:08:09", gps: true };
    const heif = makeContext("exif.heic", heifWithExif(example("sample.heic"), tiff));
    expect((await extractor.inspect(heif)).metadata.exif).toEqual(expected);
    expect((await extractor.renderImage!(heif, { maxDimension: 96 })).width).toBe(96);
    const jxl = makeContext("exif.jxl", jxlWithExif(example("sample-lossy.jxl"), tiff));
    expect((await extractor.inspect(jxl)).metadata.exif).toEqual(expected);
    const read = await extractor.read(jxl, { target: "metadata", maxBytes: 4096 });
    expect(read.content).toContain("- **model**: Test Cam 1");
  }, 30_000);
});
