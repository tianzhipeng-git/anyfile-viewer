// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";
import { buildXps } from "./test-fixtures";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function context(name: string, bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)))): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

describe("xps ./extract", () => {
  it("passes extractor compliance on real XPS samples and a synthetic OpenXPS package", async () => {
    const oxps = new Uint8Array(await buildXps({ openXps: true, pieces: true }).arrayBuffer());
    await assertExtractorCompliance(extractor, [
      {
        name: "testPPT.xps",
        filePath: resolve(EXAMPLES, "testPPT.xps"),
        invalidBytes: new TextEncoder().encode("not an xps"),
        filter: "test",
        smallMaxBytes: 64,
      },
      { name: "ghostscript-shapes.xps", filePath: resolve(EXAMPLES, "ghostscript-shapes.xps") },
      { name: "sample.oxps", bytes: oxps, targetId: "page:2" },
    ]);
  });

  it("reports core properties and the fixed-document structure", async () => {
    const inspected = await extractor.inspect(context("testPPT.xps"));
    expect(inspected.metadata).toMatchObject({
      format: "XPS",
      properties: { title: "Attachment Test", creator: "Rajiv" },
      fixedDocuments: 1,
      pageCount: 3,
    });
    expect(inspected.targets.map((target) => target.id)).toEqual(["page:1", "page:2", "page:3"]);
  });

  it("reads Glyphs text page by page", async () => {
    const page = await extractor.read(context("testPPT.xps"), { target: "page:2", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(page.content).toContain("This is a test file data with the same content as\nevery other file being tested for tika content");

    const oxps = new Uint8Array(await buildXps({ openXps: true, pieces: true }).arrayBuffer());
    const all = await extractor.read(context("sample.oxps", oxps), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(all.content).toBe("# sample.oxps\n\n## Page 1\n\nHello XPS\n\n## Page 2\n\nSecond page");
  });
});
