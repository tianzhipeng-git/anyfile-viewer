// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function context(name: string): ExtractContext {
  const filePath = resolve(EXAMPLES, name);
  const bytes = new Uint8Array(readFileSync(filePath));
  return {
    source: createBufferBinarySource(bytes, name, filePath),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

describe("ofd ./extract", () => {
  it("passes extractor compliance on the real OFD samples", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "invoice-sample.ofd",
        filePath: resolve(EXAMPLES, "invoice-sample.ofd"),
        invalidBytes: new TextEncoder().encode("not an ofd"),
        filter: "名称",
      },
      { name: "embedded-font-outline.ofd", filePath: resolve(EXAMPLES, "embedded-font-outline.ofd"), targetId: "page:2" },
      { name: "ses-v4-seal.ofd", filePath: resolve(EXAMPLES, "ses-v4-seal.ofd") },
      { name: "composite-clip.ofd", filePath: resolve(EXAMPLES, "composite-clip.ofd") },
    ]);
  });

  it("reports document info, pages and seal stamps", async () => {
    const ctx = context("invoice-sample.ofd");
    const inspected = await extractor.inspect(ctx);
    expect(inspected.metadata).toMatchObject({ pageCount: 1, signatureCount: 1, sealStampCount: 1 });
    expect(inspected.metadata.documentInfo).toMatchObject({ "Custom:发票号码": "99999951" });
    expect(inspected.targets).toEqual([{ id: "page:1", title: "Page 1 (1 seal)", kind: "page" }]);
  });

  it("reads page text line by line in reading order", async () => {
    const ctx = context("invoice-sample.ofd");
    const page = await extractor.read(ctx, { target: "page:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(page.content).toContain("项目名称 规格型号 单位 数量 单价 金额 税率 税额");
    expect(page.content).toContain("(1 electronic seal stamp on this page)");

    const doc = await extractor.read(context("embedded-font-outline.ofd"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(doc.content.startsWith("# 11.4 字型变换\n")).toBe(true);
    expect(doc.content.indexOf("## Page 1")).toBeLessThan(doc.content.indexOf("## Page 4"));
  });
});
