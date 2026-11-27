// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writePsd } from "ag-psd";
import { describe, expect, it } from "vitest";
import {
  AgentError,
  DEFAULT_READ_MAX_BYTES,
  type ExtractContext,
  type RgbaImage,
  type VendorAssets,
} from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(__dirname, "../examples");
const SAMPLE_PSD_NAME = "sample_640\u00d7426.psd";
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

describe("photoshop ./extract compliance & renderImage", () => {
  it("passes extractor compliance on the real PSD example fixture", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: SAMPLE_PSD_NAME,
        filePath: resolve(EXAMPLES, SAMPLE_PSD_NAME),
        invalidBytes: new TextEncoder().encode("not a photoshop document"),
        filter: "RGB",
        smallMaxBytes: 180,
      },
    ]);
  });

  it("extracts metadata, layer summary, and renders bounded non-blank RGBA", async () => {
    const psdPath = resolve(EXAMPLES, SAMPLE_PSD_NAME);
    const ctx = makeContext(SAMPLE_PSD_NAME, new Uint8Array(readFileSync(psdPath)), psdPath);

    const inspected = await extractor.inspect(ctx);
    expect(inspected.metadata).toMatchObject({
      format: "psd",
      width: 640,
      height: 426,
      colorMode: "RGB",
    });
    expect(inspected.targets.map((t) => t.id)).toContain("layers");

    const layersRead = await extractor.read(ctx, { target: "layers", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(layersRead.content.length).toBeGreaterThan(0);

    const full = await extractor.renderImage!(ctx, { maxDimension: 1000 });
    expect(full.width).toBe(640);
    expect(full.height).toBe(426);
    assertNonBlankRgba(full);

    const scaled = await extractor.renderImage!(ctx, { target: "composite", maxDimension: 160 });
    expect(scaled.width).toBe(160);
    expect(scaled.height).toBe(Math.round((426 / 640) * 160));
    expect(scaled.width / scaled.height).toBeCloseTo(640 / 426, 1);
    assertNonBlankRgba(scaled);
  });

  it("supports PSB files and rejects invalid targets or maxDimension", async () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const psbBuffer = writePsd(
      {
        width: 2,
        height: 1,
        imageData: { width: 2, height: 1, data: source },
        children: [{ name: "Top Layer" }, { name: "Hidden Layer", hidden: true }],
      },
      { psb: true },
    );
    const ctx = makeContext("tiny.psb", new Uint8Array(psbBuffer));
    const inspected = await extractor.inspect(ctx);
    expect(inspected.metadata).toMatchObject({
      format: "psb",
      width: 2,
      height: 1,
      layerCount: 2,
      visibleLayerCount: 1,
    });

    const rendered = await extractor.renderImage!(ctx, { maxDimension: 64 });
    expect(rendered.width).toBe(2);
    expect(rendered.height).toBe(1);
    expect(rendered.data).toEqual(source);

    await expect(
      extractor.renderImage!(ctx, { target: "nonexistent", maxDimension: 64 }),
    ).rejects.toMatchObject({ code: "target-not-found" } satisfies Partial<AgentError>);

    await expect(
      extractor.renderImage!(ctx, { maxDimension: -1 }),
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<AgentError>);
  });
});
