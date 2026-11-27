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

describe("epub ./extract", () => {
  it("passes extractor compliance on the real EPUB samples", { timeout: 30_000 }, async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "epub3.epub",
        filePath: resolve(EXAMPLES, "epub3.epub"),
        invalidBytes: new TextEncoder().encode("not an epub"),
        filter: "Paragraph 3",
      },
      { name: "epub2.epub", filePath: resolve(EXAMPLES, "epub2.epub"), targetId: "chapter:5" },
    ]);
  });

  it("reports package metadata, chapters and the TOC", async () => {
    const inspected = await extractor.inspect(context("epub3.epub"));
    expect(inspected.metadata).toMatchObject({
      title: "Local reading fixture",
      authors: ["Anyfile tests"],
      identifiers: ["fixture"],
      chapterCount: 5,
    });
    expect(inspected.metadata.toc).toHaveLength(5);
    expect(inspected.targets[0]).toEqual({ id: "chapter:1", title: "Chapter 1", kind: "chapter" });
  });

  it("reads chapters as clean Markdown and the whole book lazily", async () => {
    const chapter = await extractor.read(context("epub2.epub"), { target: "chapter:2", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(chapter.content.startsWith("## Chapter 2: Chapter 2\n\n### Chapter 2\n\nOriginal local reading fixture. Chapter 2.")).toBe(true);
    expect(chapter.content).not.toMatch(/<[a-z]|base64|data:/i);

    const book = await extractor.read(context("epub3.epub"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(book.content.startsWith("# Local reading fixture\n\n- **Authors**: Anyfile tests")).toBe(true);
    expect(book.content.indexOf("## Chapter 1:")).toBeLessThan(book.content.indexOf("## Chapter 5:"));
  });

  it("maps DRM-marked books to encrypted-file", async () => {
    await expect(extractor.inspect(context("drm.epub"))).rejects.toMatchObject({ code: "encrypted-file" });
  });
});
