import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ViewerError } from "@anyfile/viewer-protocol";
import { ExrDocument } from "./exr-decoder";
import { decodeRadianceHdr } from "./radiance-hdr";
import { buildSyntheticExr, encodeRadianceHdr } from "./test-fixtures";
import { computeDynamicRange, DEFAULT_TONE_MAP, toneMapToRgba8 } from "./tone-map";

const EXAMPLES_DIR = resolve(__dirname, "../examples");

describe("OpenEXR decoder", () => {
  it("decodes real ASWF AllHalfValues.exr sample", () => {
    const bytes = new Uint8Array(readFileSync(join(EXAMPLES_DIR, "all-half-values.exr")));
    const doc = ExrDocument.parse(bytes);
    const frame = doc.decodeLayer(0);
    expect(frame.format).toBe("openexr");
    expect(frame.width).toBe(256);
    expect(frame.height).toBe(256);
    expect(frame.rgba.length).toBe(256 * 256 * 4);
    expect(frame.parts).toHaveLength(1);
    expect(frame.parts[0].layers.length).toBeGreaterThanOrEqual(1);
  });

  it("decodes multi-channel ZIP EXR and switches AOV layers", () => {
    const bytes = buildSyntheticExr({
      width: 16,
      height: 12,
      compression: 3,
      envmap: 0,
      channels: [
        { name: "R", pixelType: 1, valueAt: (x) => x / 4 },
        { name: "G", pixelType: 1, valueAt: (_, y) => y / 4 },
        { name: "B", pixelType: 1, valueAt: () => 2.5 },
        { name: "A", pixelType: 1, valueAt: () => 0.75 },
        { name: "diffuse.R", pixelType: 2, valueAt: () => 4.0 },
        { name: "diffuse.G", pixelType: 2, valueAt: () => 0.5 },
        { name: "diffuse.B", pixelType: 2, valueAt: () => 0.25 },
        { name: "Normal.X", pixelType: 2, valueAt: () => 0.0 },
        { name: "Normal.Y", pixelType: 2, valueAt: () => 1.0 },
        { name: "Normal.Z", pixelType: 2, valueAt: () => 0.0 },
        { name: "Z", pixelType: 2, valueAt: (x, y) => 10 + x + y },
      ],
    });

    const doc = ExrDocument.parse(bytes);
    const beauty = doc.decodeLayer(0);
    expect(beauty.width).toBe(16);
    expect(beauty.height).toBe(12);
    expect(beauty.hasAlpha).toBe(true);
    expect(beauty.isEquirectangular).toBe(true);
    expect(beauty.parts[0].layers.map((l) => l.id)).toEqual([
      "beauty",
      "layer:Normal",
      "layer:diffuse",
      "ch:Z",
    ]);
    // Pixel (8, 4) -> R=2.0, G=1.0, B=2.5, A=0.75
    const idx = (4 * 16 + 8) * 4;
    expect(beauty.rgba[idx]).toBeCloseTo(2.0, 2);
    expect(beauty.rgba[idx + 1]).toBeCloseTo(1.0, 2);
    expect(beauty.rgba[idx + 2]).toBeCloseTo(2.5, 2);
    expect(beauty.rgba[idx + 3]).toBeCloseTo(0.75, 2);

    const diffuse = doc.decodeLayer(0, "layer:diffuse");
    expect(diffuse.rgba[0]).toBeCloseTo(4.0, 4);
    expect(diffuse.rgba[1]).toBeCloseTo(0.5, 4);
    expect(diffuse.rgba[2]).toBeCloseTo(0.25, 4);

    const depth = doc.decodeLayer(0, "ch:Z");
    expect(depth.rgba[(2 * 16 + 3) * 4]).toBeCloseTo(15, 4);
  });

  it("rejects truncated, corrupt, and oversized OpenEXR inputs", () => {
    expect(() => ExrDocument.parse(new Uint8Array([0x76, 0x2f, 0x31, 0x01]))).toThrow(ViewerError);
    expect(() => ExrDocument.parse(new TextEncoder().encode("not an exr file at all"))).toThrow(ViewerError);

    const valid = buildSyntheticExr({
      width: 4,
      height: 4,
      compression: 0,
      channels: [{ name: "R", pixelType: 1, valueAt: () => 1 }],
    });
    expect(() => ExrDocument.parse(valid.subarray(0, valid.byteLength - 10)).decodeLayer(0)).toThrow(ViewerError);
  });

  const envFile = process.env.HDR_TEST_FILE;
  it.skipIf(!envFile || !existsSync(envFile))("decodes external HDR_TEST_FILE when provided", () => {
    const bytes = new Uint8Array(readFileSync(envFile!));
    if (envFile!.toLowerCase().endsWith(".exr")) {
      const doc = ExrDocument.parse(bytes);
      const frame = doc.decodeLayer(0);
      expect(frame.width).toBeGreaterThan(0);
      expect(frame.height).toBeGreaterThan(0);
    } else {
      const frame = decodeRadianceHdr(bytes);
      expect(frame.width).toBeGreaterThan(0);
      expect(frame.height).toBeGreaterThan(0);
    }
  });
});

describe("Radiance HDR decoder", () => {
  it("decodes adaptive RLE RGBE and uncompressed XYZE files accurately", () => {
    const rgbeBytes = encodeRadianceHdr(
      16,
      8,
      (x, y) => [x * 0.5, y * 1.0, 4.0],
      { rle: true, comment: "test gradient" },
    );
    const frame = decodeRadianceHdr(rgbeBytes);
    expect(frame.format).toBe("radiance-hdr");
    expect(frame.width).toBe(16);
    expect(frame.height).toBe(8);
    expect(frame.isEquirectangular).toBe(true);
    const idx = (3 * 16 + 6) * 4;
    expect(frame.rgba[idx]).toBeCloseTo(3.0, 1);
    expect(frame.rgba[idx + 1]).toBeCloseTo(3.0, 1);
    expect(frame.rgba[idx + 2]).toBeCloseTo(4.0, 1);
    expect(frame.rgba[idx + 3]).toBe(1.0);

    const xyzeBytes = encodeRadianceHdr(4, 4, () => [0.95, 1.0, 1.09], { rle: false, xyze: true });
    const xyzFrame = decodeRadianceHdr(xyzeBytes);
    expect(xyzFrame.rgba[0]).toBeGreaterThan(0.8);
    expect(xyzFrame.rgba[1]).toBeGreaterThan(0.8);
    expect(xyzFrame.rgba[2]).toBeGreaterThan(0.8);
  });

  it("rejects malformed or truncated Radiance HDR files", () => {
    expect(() => decodeRadianceHdr(new TextEncoder().encode("not hdr"))).toThrow(ViewerError);
    const valid = encodeRadianceHdr(16, 8, () => [1, 1, 1], { rle: true });
    expect(() => decodeRadianceHdr(valid.subarray(0, valid.byteLength - 12))).toThrow(ViewerError);
  });
});

describe("Tone mapping and dynamic range", () => {
  it("computes dynamic range and applies ACES, Reinhard, Filmic, Linear, and False Color", () => {
    const src = new Float32Array([
      0.18, 0.18, 0.18, 1.0,
      4.0, 1.0, 0.25, 0.5,
    ]);
    const dr = computeDynamicRange(src, 2, 1);
    expect(dr.minLuminance).toBeCloseTo(0.18, 2);
    expect(dr.maxLuminance).toBeGreaterThan(1.5);

    const dst = new Uint8ClampedArray(8);
    for (const operator of ["aces", "reinhard", "filmic", "linear"] as const) {
      toneMapToRgba8(src, dst, { ...DEFAULT_TONE_MAP, operator });
      expect(dst[3]).toBe(255);
      expect(dst[4]).toBeGreaterThan(dst[6]); // R > B on second pixel
    }

    toneMapToRgba8(src, dst, { ...DEFAULT_TONE_MAP, channelMode: "a" });
    expect(dst[0]).toBe(255);
    expect(dst[4]).toBe(128);

    toneMapToRgba8(src, dst, { ...DEFAULT_TONE_MAP, channelMode: "false-color" });
    expect(dst[1]).toBeGreaterThan(150); // 0.18 middle gray maps near green
  });
});
