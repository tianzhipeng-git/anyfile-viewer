// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { describe, expect, it } from "vitest";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
function contextFor(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
  return { source: createBufferBinarySource(bytes, name), file: new File([bytes], name), vendor: createNodeVendorAssets(), signal: new AbortController().signal };
}

describe("visio ./extract (libvisio WASM in Node)", () => {
  it("passes extractor compliance on VSDX and VSD samples", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "tdf154379-DrawingUnits-type.vsd", filePath: resolve(EXAMPLES, "tdf154379-DrawingUnits-type.vsd"), targetId: "page:1", filter: "cm", smallMaxBytes: 200, invalidBytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
      { name: "Visio11FormatLine.vsd", filePath: resolve(EXAMPLES, "Visio11FormatLine.vsd") },
      { name: "color-boxes.vsdx", filePath: resolve(EXAMPLES, "color-boxes.vsdx") },
    ]);
  });

  it("lists pages with sizes and reads shape text per page", async () => {
    const context = contextFor("tdf154379-DrawingUnits-type.vsd");
    const inspected = await extractor.inspect(context);
    expect(inspected.metadata).toMatchObject({ format: "vsd", pages: 2, pageSizes: ["11.69 × 8.27 in"] });
    expect(inspected.targets.map((target) => target.id)).toEqual(["page:1", "page:2"]);
    const all = (await extractor.read(context, { maxBytes: 48 * 1024 })).content;
    expect(all).toContain("## Page 1");
    expect(all).toContain("## Page 2");
    expect(all).toContain("- Rue Friant");
    expect(all).not.toContain("<path");
    const filtered = await extractor.read(context, { target: "page:1", filter: "cm x", maxBytes: 48 * 1024 });
    expect(filtered.content).toContain("- 180.0 cm x 394.0 cm");
    await expect(extractor.read(context, { target: "page:3", maxBytes: 1024 })).rejects.toMatchObject({ code: "target-not-found" });

    const boxes = await extractor.inspect(contextFor("color-boxes.vsdx"));
    expect(boxes.metadata).toMatchObject({ format: "vsdx", pages: 1, textBlocks: 0, drawingElements: 14 });
  });
});
