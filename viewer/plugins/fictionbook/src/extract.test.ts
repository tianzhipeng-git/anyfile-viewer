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

describe("fictionbook ./extract", () => {
  it("passes extractor compliance on the real FB2 samples", { timeout: 30_000 }, async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "normal.fb2",
        filePath: resolve(EXAMPLES, "normal.fb2"),
        invalidBytes: new TextEncoder().encode("<FictionBook>not closed"),
        filter: "paragraph 7",
      },
      { name: "normal.fb2.zip", filePath: resolve(EXAMPLES, "normal.fb2.zip"), targetId: "chapter:2" },
      { name: "cp1251.fb2", filePath: resolve(EXAMPLES, "cp1251.fb2") },
    ]);
  });

  it("reports title-info, chapters and the TOC", async () => {
    const inspected = await extractor.inspect(context("normal.fb2"));
    expect(inspected.metadata).toMatchObject({ title: "Original fixture", authors: ["Local Author"], binaryCount: 1 });
    expect(inspected.targets[0]).toEqual({ id: "chapter:1", title: "Chapter 1", kind: "chapter" });
    expect(inspected.metadata.toc).toContainEqual({ label: "Nested 1", chapter: 1 });

    const cyrillic = await extractor.inspect(context("cp1251.fb2"));
    expect(cyrillic.metadata.title).toBe("Книга");
  });

  it("reads chapters as clean Markdown without binaries", async () => {
    const chapter = await extractor.read(context("normal.fb2.zip"), { target: "chapter:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(chapter.content.startsWith("## Chapter 1: Chapter 1\n\n### Chapter 1\n\nLocal reading. Footnote")).toBe(true);
    expect(chapter.content).toContain("> First verse\n\n> Second verse");
    expect(chapter.content).toContain("| Key | Value |");
    expect(chapter.content).not.toMatch(/<[a-z]|iVBOR/i);

    const book = await extractor.read(context("normal.fb2"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(book.content.startsWith("# Original fixture\n\n- **Authors**: Local Author")).toBe(true);
  });
});
