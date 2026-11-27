// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLE = resolve(process.cwd(), "examples/little-square.cbz");
const FIXTURES = resolve(process.cwd(), "../../../docs/ebooks/fixtures/phase45");

function contextFor(path: string, name = path.split("/").pop()!): ExtractContext {
  const bytes = new Uint8Array(readFileSync(path));
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: createNodeVendorAssets(),
    signal: new AbortController().signal,
  };
}

describe("comic-book ./extract", () => {
  it("passes extractor compliance on the real CBZ example", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "little-square.cbz", filePath: EXAMPLE, invalidBytes: new TextEncoder().encode("not a comic"), filter: "page", smallMaxBytes: 64 },
      { name: "little-square.cbz", filePath: EXAMPLE, targetId: "pages", filter: "jpg", smallMaxBytes: 90 },
    ]);
  }, 30_000);

  it("reports ComicInfo metadata and the page list", async () => {
    const context = contextFor(EXAMPLE);
    const { metadata, targets } = await extractor.inspect(context);
    expect(metadata).toMatchObject({
      format: "CBZ (ZIP)", pageCount: 4, imageTypes: { jpg: 2, png: 2 }, readingDirection: "left-to-right", hasComicInfo: true,
      comicInfo: { Title: "The Little Square", Series: "Anyfile Sample Comics", Number: "1", Writer: "anyfile-viewer contributors" },
    });
    expect((metadata.comicInfo as Record<string, string>).Summary).toMatch(/^A small orange square/);
    expect(targets.map((target) => target.id)).toEqual(["info", "pages"]);

    const pages = await extractor.read(context, { target: "pages", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(pages.content.split("\n").slice(2)).toEqual([
      "| 1 | pages/01.jpg | 6830 | FrontCover |  |",
      "| 2 | pages/02.png | 831 |  |  |",
      "| 3 | pages/03.jpg | 9039 |  | yes |",
      "| 4 | pages/10.png | 938 | BackCover |  |",
    ]);
    const all = await extractor.read(context, { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(all.content).toMatch(/^# The Little Square\n/);
    expect(all.content).toContain("- **Writer**: anyfile-viewer contributors");
    expect(all.content).toContain("| 4 | pages/10.png | 938 | BackCover |  |");
  });

  it.each([
    ["pages.cbt", "CBT (TAR)"],
    ["pages.cb7", "CB7 (7z)"],
    ["rar4.cbr", "CBR (RAR 4)"],
    ["rar5.cbr", "CBR (RAR 5)"],
  ])("lists %s pages", async (name, format) => {
    const context = contextFor(resolve(FIXTURES, name));
    expect((await extractor.inspect(context)).metadata).toMatchObject({ format, pageCount: 5 });
    const { content } = await extractor.read(context, { target: "pages", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(content).toContain("| 5 | volume1/10.png | 217 |  |  |");
  }, 30_000);

  it("maps encrypted archives to encrypted-file", async () => {
    await expect(extractor.inspect(contextFor(resolve(FIXTURES, "encrypted.cbr")))).rejects.toMatchObject({ code: "encrypted-file" });
  });
});
