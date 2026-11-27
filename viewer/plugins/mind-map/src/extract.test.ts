// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor, { sheetOutline } from "./extract";
import { parseContent } from "./parse";

const EXAMPLES = resolve(process.cwd(), "examples");
const SAMPLES = ["planning.mm", "planning.xmind", "planning-legacy.xmind", "planning.mmap"];
const NOOP_VENDOR = { url: async () => "", bytes: async () => new Uint8Array() };

function contextFor(name: string): ExtractContext {
  const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

describe("mind-map ./extract", () => {
  it("passes extractor compliance on every example format", async () => {
    await assertExtractorCompliance(extractor, SAMPLES.map((name, index) => ({
      name,
      filePath: resolve(EXAMPLES, name),
      ...(index === 0 ? { invalidBytes: new TextEncoder().encode("<map><node TEXT='a'><node></map>"), filter: "task" } : {}),
      smallMaxBytes: 48,
    })));
  }, 30_000);

  it.each([
    ["planning.mm", "FreeMind / Freeplane", 7],
    ["planning.xmind", "XMind", 7],
    ["planning-legacy.xmind", "XMind (legacy XML)", 4],
    ["planning.mmap", "MindManager", 4],
  ])("outlines %s", async (name, format, topics) => {
    const context = contextFor(name);
    const { metadata, targets } = await extractor.inspect(context);
    expect(metadata).toMatchObject({ format, sheetCount: 1, topicCount: topics });
    expect(targets).toEqual([{ id: "sheet:1", title: expect.any(String), kind: "sheet", size: topics }]);
    const { content } = await extractor.read(context, { target: "sheet:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(content).toContain("- 项目计划 / Project plan");
    expect(content).toContain("  - 调研 / Research");
    expect(content).toContain("  - 验证 / Validation");
  });

  it("includes notes, labels, links and relationships", () => {
    const [sheet] = parseContent(
      `<map><node ID="a" TEXT="Root" LINK="https://example.com"><node ID="b" TEXT="Child"><richcontent TYPE="NOTE"><html><body><p>First note</p><p>Second</p></body></html></richcontent><arrowlink DESTINATION="a" MIDDLE_LABEL="back"/></node></node></map>`,
      "mm",
      new AbortController().signal,
    );
    expect(sheetOutline(sheet!, 0).split("\n")).toEqual([
      "## Sheet 1: Root",
      "",
      "- Root <https://example.com>",
      "  - Child",
      "    > First note",
      "    > Second",
      "",
      "Relationships:",
      "- Child → Root: back",
    ]);
  });
});
