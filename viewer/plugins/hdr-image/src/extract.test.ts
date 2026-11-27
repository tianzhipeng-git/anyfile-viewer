// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentError, type ExtractContext, type RgbaImage, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";
import { buildSyntheticExr } from "./test-fixtures";

const EXAMPLES = resolve(__dirname, "../examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function makeContext(name: string, bytes: Uint8Array, filePath?: string): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name, filePath),
    file: new File([new Uint8Array(bytes)], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

function assertNonBlankRgba(image: RgbaImage): void {
  expect(image.data).toBeInstanceOf(Uint8ClampedArray);
  expect(image.data.byteLength).toBe(image.width * image.height * 4);
  let nonZeroRgb = 0;
  const firstR = image.data[0];
  const firstG = image.data[1];
  const firstB = image.data[2];
  let hasVariance = false;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    if (r > 0 || g > 0 || b > 0) nonZeroRgb += 1;
    if (r !== firstR || g !== firstG || b !== firstB) hasVariance = true;
  }
  expect(nonZeroRgb).toBeGreaterThan(0);
  expect(hasVariance).toBe(true);
}

describe("hdr-image ./extract compliance & renderImage", () => {
  it("passes extractor compliance on real EXR and Radiance HDR fixtures", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "all-half-values.exr",
        filePath: resolve(EXAMPLES, "all-half-values.exr"),
        invalidBytes: new TextEncoder().encode("not an hdr or exr file"),
        filter: "compression",
        smallMaxBytes: 180,
      },
      {
        name: "studio-gradient.hdr",
        filePath: resolve(EXAMPLES, "studio-gradient.hdr"),
        invalidBytes: new TextEncoder().encode("#?RADIANCE\n\n-Y 4 +X 4\n"),
        filter: "RLE",
        smallMaxBytes: 180,
      },
    ]);
  });

  it("renders bounded, non-blank RGBA images for OpenEXR and Radiance HDR", async () => {
    const exrPath = resolve(EXAMPLES, "all-half-values.exr");
    const exrCtx = makeContext("all-half-values.exr", new Uint8Array(readFileSync(exrPath)), exrPath);
    const exrInspect = await extractor.inspect(exrCtx);
    expect(exrInspect.metadata).toMatchObject({ format: "openexr", width: 256, height: 256 });

    const exrFull = await extractor.renderImage!(exrCtx, { maxDimension: 512 });
    expect(exrFull.width).toBe(256);
    expect(exrFull.height).toBe(256);
    assertNonBlankRgba(exrFull);

    const exrThumb = await extractor.renderImage!(exrCtx, { maxDimension: 96 });
    expect(exrThumb.width).toBe(96);
    expect(exrThumb.height).toBe(96);
    assertNonBlankRgba(exrThumb);

    const hdrPath = resolve(EXAMPLES, "studio-gradient.hdr");
    const hdrCtx = makeContext("studio-gradient.hdr", new Uint8Array(readFileSync(hdrPath)), hdrPath);
    const hdrInspect = await extractor.inspect(hdrCtx);
    const origW = Number(hdrInspect.metadata.width);
    const origH = Number(hdrInspect.metadata.height);
    expect(hdrInspect.metadata.format).toBe("radiance-hdr");
    expect(origW).toBeGreaterThan(0);
    expect(origH).toBeGreaterThan(0);

    const hdrThumb = await extractor.renderImage!(hdrCtx, { maxDimension: 64 });
    expect(Math.max(hdrThumb.width, hdrThumb.height)).toBeLessThanOrEqual(64);
    expect(hdrThumb.width / hdrThumb.height).toBeCloseTo(origW / origH, 1);
    assertNonBlankRgba(hdrThumb);
  });

  it("supports rendering specific AOV layer targets and rejects invalid targets/dimensions", async () => {
    const bytes = buildSyntheticExr({
      width: 32,
      height: 16,
      compression: 3,
      channels: [
        { name: "R", pixelType: 1, valueAt: (x) => x / 16 },
        { name: "G", pixelType: 1, valueAt: (_, y) => y / 16 },
        { name: "B", pixelType: 1, valueAt: () => 0.5 },
        { name: "diffuse.R", pixelType: 2, valueAt: (x) => (x + 1) / 8 },
        { name: "diffuse.G", pixelType: 2, valueAt: () => 0.25 },
        { name: "diffuse.B", pixelType: 2, valueAt: () => 0.1 },
      ],
    });
    const ctx = makeContext("multi-aov.exr", bytes);
    const inspected = await extractor.inspect(ctx);
    const diffuseTarget = inspected.targets.find((t) => t.id.includes("diffuse"));
    expect(diffuseTarget).toBeDefined();

    const img = await extractor.renderImage!(ctx, { target: diffuseTarget!.id, maxDimension: 16 });
    expect(img.width).toBe(16);
    expect(img.height).toBe(8);
    assertNonBlankRgba(img);

    await expect(
      extractor.renderImage!(ctx, { target: "part:99:missing", maxDimension: 64 }),
    ).rejects.toMatchObject({ code: "target-not-found" } satisfies Partial<AgentError>);

    await expect(
      extractor.renderImage!(ctx, { maxDimension: 0 }),
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<AgentError>);
  });
});
