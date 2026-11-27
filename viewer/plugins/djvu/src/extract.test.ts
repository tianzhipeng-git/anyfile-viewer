// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

function context(name: string): ExtractContext {
  const filePath = resolve(EXAMPLES, name);
  const bytes = new Uint8Array(readFileSync(filePath));
  return {
    source: createBufferBinarySource(bytes, name, filePath),
    file: new File([bytes], name),
    vendor: createNodeVendorAssets(),
    signal: new AbortController().signal,
  };
}

describe("djvu ./extract", () => {
  it("passes extractor compliance on the real DjVu samples", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "lizard2002.djvu",
        filePath: resolve(EXAMPLES, "lizard2002.djvu"),
        invalidBytes: new TextEncoder().encode("AT&TFORM\0\0\0\x10DJVUCORRUPT"),
      },
      { name: "djvu3spec.djvu", filePath: resolve(EXAMPLES, "djvu3spec.djvu"), targetId: "page:2", filter: "DjVu" },
    ]);
  }, 30_000);

  it("reports pages, sizes, outline and hidden-text coverage", async () => {
    const inspected = await extractor.inspect(context("djvu3spec.djvu"));
    expect(inspected.metadata).toMatchObject({ documentType: "bundled", pageCount: 71, sampledPages: 71 });
    expect(inspected.metadata.sampledPagesWithText).toBeGreaterThan(60);
    expect((inspected.metadata.outline as string[]).length).toBeGreaterThanOrEqual(13);
    expect(inspected.targets).toHaveLength(71);
    expect(inspected.targets[0]).toMatchObject({ id: "page:1", kind: "page" });
  }, 30_000);

  it("reads the hidden text layer line by line", async () => {
    const page = await extractor.read(context("djvu3spec.djvu"), { target: "page:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(page.content.startsWith("## Page 1\n\n")).toBe(true);
    expect(page.content).toMatch(/DjVu/);
    expect(page.content.split("\n").length).toBeGreaterThan(10);

    const doc = await extractor.read(context("lizard2002.djvu"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(doc.content.startsWith("# lizard2002.djvu\n")).toBe(true);
    expect(doc.content.indexOf("## Page 1")).toBeLessThan(doc.content.indexOf("## Page 2"));
  }, 30_000);
});
