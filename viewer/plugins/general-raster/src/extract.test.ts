// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractContext, VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const EXAMPLES = resolve(__dirname, "../examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function context(name: string): ExtractContext {
  const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

describe("general-raster ./extract", () => {
  it("passes extractor compliance on real TIFF, GeoTIFF, TGA and Netpbm samples", async () => {
    const fixture = (name: string, invalid: string) => ({
      name,
      filePath: resolve(EXAMPLES, name),
      invalidBytes: new Uint8Array(readFileSync(resolve(EXAMPLES, invalid))),
      targetId: "page:1",
      filter: "width",
      smallMaxBytes: 120,
    });
    await assertExtractorCompliance(extractor, [
      fixture("sample-multipage.tiff", "corrupt.tiff"),
      fixture("sample-geotiff.tiff", "truncated-sample-lzw.tiff"),
      fixture("sample-rle.tga", "corrupt.tga"),
      fixture("sample.ppm", "corrupt.ppm"),
    ]);
  }, 30_000);

  it("reports TIFF pages, tags and GeoTIFF CRS and bounds", async () => {
    const multipage = await extractor.inspect(context("sample-multipage.tiff"));
    expect(multipage.metadata).toMatchObject({ format: "TIFF", width: 96, height: 64, bitDepth: 8, pageCount: 2, compression: "LZW" });
    expect(multipage.targets.map((target) => target.id)).toEqual(["metadata", "page:1", "page:2"]);

    const geo = await extractor.inspect(context("sample-geotiff.tiff"));
    expect(geo.metadata).toMatchObject({
      width: 32,
      height: 16,
      geo: { crs: "EPSG:4326", bounds: [116, 32, 132, 40], resolution: [0.5, -0.5, 0], geoKeys: { GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326 } },
    });
    const read = await extractor.read(context("sample-geotiff.tiff"), { target: "metadata", maxBytes: 48 * 1024 });
    expect(read.content).toContain("### GeoTIFF");
    expect(read.content).toContain("**GeoKeyDirectory**");
    expect(read.content).toContain("**ImageWidth**: 32");

    const oriented = await extractor.inspect(context("sample-oriented.tiff"));
    expect(oriented.metadata).toMatchObject({ orientation: 6, width: 64, height: 96 });
  });

  it("renders pages with real pixel values and bounds the output", async () => {
    const geo = await extractor.renderImage!(context("sample-geotiff.tiff"), { maxDimension: 64 });
    expect(geo).toMatchObject({ width: 32, height: 16 });
    const at = (x: number, y: number) => Array.from(geo.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4));
    expect(at(0, 0)).toEqual([0, 0, 128, 255]);
    expect(at(3, 2)).toEqual([24, 32, 128, 255]);

    const second = await extractor.renderImage!(context("sample-multipage.tiff"), { target: "page:2", maxDimension: 48 });
    expect(second).toMatchObject({ width: 48, height: 32 });
    expect(second.data).toHaveLength(48 * 32 * 4);

    const ppm = await extractor.renderImage!(context("sample-ascii.ppm"), { maxDimension: 16 });
    expect(Array.from(ppm.data)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);

    await expect(extractor.renderImage!(context("sample-multipage.tiff"), { target: "page:3", maxDimension: 64 }))
      .rejects.toMatchObject({ code: "target-not-found" });
    await expect(extractor.renderImage!(context("sample.tga"), { target: "metadata", maxDimension: 64 }))
      .rejects.toMatchObject({ code: "target-not-found" });
    await expect(extractor.renderImage!(context("sample.tga"), { maxDimension: 0 }))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });
});
