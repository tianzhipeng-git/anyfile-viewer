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

describe("iwork ./extract", () => {
  it("passes extractor compliance on IWA and iWork '09 samples", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "testPages2013.pages",
        filePath: resolve(EXAMPLES, "testPages2013.pages"),
        invalidBytes: new TextEncoder().encode("not a zip"),
        filter: "text",
      },
      { name: "testKeynote2013.key", filePath: resolve(EXAMPLES, "testKeynote2013.key"), filter: "slide" },
      { name: "testKeynote2018.key", filePath: resolve(EXAMPLES, "testKeynote2018.key") },
      // iWork '09 XML is re-parsed on every read; a larger page keeps the cursor walk short.
      { name: "testKeynote.key", filePath: resolve(EXAMPLES, "testKeynote.key"), smallMaxBytes: 2048 },
    ]);
  }, 30_000);

  it("reads iWork '09 Pages XML body text", async () => {
    const ctx = context("testPages.pages");
    const inspected = await extractor.inspect(ctx);
    expect(inspected.metadata).toMatchObject({ app: "pages", generation: "iWork '09" });
    const body = await extractor.read(ctx, { target: "body", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(body.content.startsWith("## Document text\n\nSample pages document\n\nSome plain text to parse.")).toBe(true);
  });

  it("lists Keynote slides as targets and reads slide text", async () => {
    const ctx = context("testKeynote2013.key");
    const inspected = await extractor.inspect(ctx);
    expect(inspected.metadata).toMatchObject({ app: "keynote", generation: "iWork 2013+", slideCount: 3 });
    expect(inspected.targets.map((target) => target.id)).toEqual(["slide:1", "slide:2", "slide:3"]);
    const slide = await extractor.read(ctx, { target: "slide:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(slide.content.startsWith("## Slide 1")).toBe(true);
  });

  it("reads Pages body text and text boxes", async () => {
    const ctx = context("testPages2013.pages");
    const inspected = await extractor.inspect(ctx);
    expect(inspected.targets.map((target) => target.id)).toEqual(["body", "text-boxes"]);
    const all = await extractor.read(ctx, { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(all.content).toContain("Sample pages document");
    expect(all.content).toContain("A text box with text.");
    const filtered = await extractor.read(ctx, { filter: "box with", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(filtered).toMatchObject({ filterApplied: true, content: "A text box with text." });
  });

  it("reports password-protected documents as encrypted", async () => {
    await expect(extractor.inspect(context("testPagesPwdProtected.pages"))).rejects.toMatchObject({ code: "encrypted-file" });
  });
});
