// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractContext, RgbaImage, VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";
import { dicomFixture } from "./fixtures";

const EXAMPLES = resolve(__dirname, "../examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function context(name: string, bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)))): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

const pixel = (image: RgbaImage, x: number, y: number) =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

describe("dicom ./extract", () => {
  it("passes extractor compliance on real renderable examples", async () => {
    const invalidBytes = readFileSync(resolve(EXAMPLES, "synthetic-rgb.dicom")).subarray(0, 400);
    await assertExtractorCompliance(extractor, [
      { name: "synthetic-multiframe.dcm", filePath: resolve(EXAMPLES, "synthetic-multiframe.dcm"), targetId: "frame:2", filter: "window", smallMaxBytes: 80, invalidBytes: new TextEncoder().encode("not dicom") },
      { name: "synthetic-rgb.dicom", filePath: resolve(EXAMPLES, "synthetic-rgb.dicom"), targetId: "frame:1", filter: "dimensions", smallMaxBytes: 60, invalidBytes },
    ]);
  }, 30_000);

  it("inspects image attributes and pages the tag table", async () => {
    const inspected = await extractor.inspect(context("synthetic-multiframe.dcm"));
    expect(inspected.metadata).toMatchObject({
      transferSyntaxName: "Explicit VR Little Endian",
      modality: "OT",
      rows: 128,
      columns: 128,
      frames: 3,
      bitsAllocated: 16,
      photometricInterpretation: "MONOCHROME2",
      windowCenter: 0,
      windowWidth: 2400,
      renderable: true,
    });
    expect(inspected.targets.map((target) => target.id)).toEqual(["tags", "frame:1", "frame:2", "frame:3"]);
    const tags = await extractor.read(context("synthetic-multiframe.dcm"), { target: "tags", maxBytes: 48 * 1024 });
    expect(tags.content).toContain("| (0028,0010) | Rows | US | 128 |");
    expect(tags.content).toContain("| (0028,1051) | WindowWidth | DS | 2400 |");
    expect(tags.content).toMatch(/PixelData \| OW \| <pixel data, 98304 bytes, not read>/);

    const pages: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await extractor.read(context("synthetic-multiframe.dcm"), { target: "tags", filter: "(0028", cursor, maxBytes: 120 });
      expect(page.filterApplied).toBe(true);
      pages.push(page.content);
      cursor = page.nextCursor;
    } while (cursor);
    const rows = pages.join("\n").split("\n").filter((line) => line.startsWith("| (0028"));
    expect(rows).toHaveLength(11);
  });

  it("masks patient-identifying tags by default", async () => {
    const bytes = dicomFixture({
      extra: [
        [0x10, 0x10, "PN", "Doe^Jane"],
        [0x10, 0x20, "LO", "MRN-12345"],
        [0x10, 0x30, "DA", "19700101"],
        [0x10, 0x40, "CS", "F"],
        [0x08, 0x80, "LO", "General Hospital"],
        [0x09, 0x10, "LO", "VENDOR PRIVATE"],
        [0x08, 0x1030, "LO", "Chest"],
      ],
    });
    const ctx = context("phi.dcm", bytes);
    const inspected = await extractor.inspect(ctx);
    expect(inspected.metadata).toMatchObject({ studyDescription: "Chest", identifyingTagsMasked: true });
    const text = JSON.stringify(inspected) + (await extractor.read(ctx, { maxBytes: 48 * 1024 })).content;
    for (const secret of ["Doe", "MRN-12345", "19700101", "General Hospital", "VENDOR PRIVATE"]) expect(text).not.toContain(secret);
    expect(text).toContain("| (0010,0010) | PatientName | PN | <masked> |");
    expect(text).toContain("| (0010,0040) | PatientSex | CS | F |");
  });

  it("renders frames with the default window and RGB pixels", async () => {
    const first = await extractor.renderImage!(context("synthetic-multiframe.dcm"), { maxDimension: 512 });
    expect(first).toMatchObject({ width: 128, height: 128 });
    expect(pixel(first, 0, 0)).toEqual([21, 21, 21, 255]);
    expect(pixel(first, 64, 64)).toEqual([255, 255, 255, 255]);
    const third = await extractor.renderImage!(context("synthetic-multiframe.dcm"), { target: "frame:3", maxDimension: 512 });
    expect(pixel(third, 64, 64)).toEqual([213, 213, 213, 255]);
    const thumb = await extractor.renderImage!(context("synthetic-multiframe.dcm"), { target: "frame:1", maxDimension: 32 });
    expect(thumb).toMatchObject({ width: 32, height: 32 });

    const rgb = await extractor.renderImage!(context("synthetic-rgb.dicom"), { maxDimension: 512 });
    expect(pixel(rgb, 10, 5)).toEqual([20, 10, 235, 255]);

    await expect(extractor.renderImage!(context("synthetic-multiframe.dcm"), { target: "frame:4", maxDimension: 64 }))
      .rejects.toMatchObject({ code: "target-not-found" });
    await expect(extractor.renderImage!(context("synthetic-multiframe.dcm"), { maxDimension: 0 }))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("keeps metadata-only files readable and reports unsupported rendering", async () => {
    const ctx = context("synthetic-metadata-only.dcm");
    const inspected = await extractor.inspect(ctx);
    expect(inspected.metadata).toMatchObject({ photometricInterpretation: "PALETTE COLOR", renderable: false });
    expect(inspected.targets.map((target) => target.id)).toEqual(["tags"]);
    expect((await extractor.read(ctx, { maxBytes: 4096 })).content).toContain("PALETTE COLOR");
    await expect(extractor.renderImage!(ctx, { maxDimension: 64 })).rejects.toMatchObject({ code: "unsupported-capability" });

    const jpeg = context("jpeg.dcm", dicomFixture({ syntax: "1.2.840.10008.1.2.4.50" }));
    expect((await extractor.inspect(jpeg)).metadata).toMatchObject({ transferSyntaxName: "JPEG Baseline", renderable: false });
    await expect(extractor.renderImage!(jpeg, { maxDimension: 64 })).rejects.toMatchObject({ code: "unsupported-capability" });

    const deflated = context("deflated.dcm", dicomFixture({ syntax: "1.2.840.10008.1.2.1.99" }));
    expect((await extractor.read(deflated, { maxBytes: 4096 })).content).toContain("TransferSyntaxUID");
    await expect(extractor.renderImage!(deflated, { maxDimension: 64 })).rejects.toMatchObject({ code: "unsupported-capability" });
  });
});
