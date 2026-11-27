// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const SAMPLES = ["OpenFigs.fig", "circle.fig", "artboard-backgrounds.sketch", "colored-strings.sketch"];
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

describe("design-source ./extract", () => {
  it("passes extractor compliance on real Figma and Sketch files", async () => {
    await assertExtractorCompliance(extractor, SAMPLES.map((name, index) => ({
      name,
      filePath: resolve(EXAMPLES, name),
      ...(index === 0 ? { invalidBytes: new TextEncoder().encode("not a figma file") } : {}),
      ...(index === 3 ? { filter: "color" } : {}),
      smallMaxBytes: 40,
    })));
  }, 30_000);

  it("outlines Figma layers with type and size", async () => {
    const context = contextFor("circle.fig");
    const { metadata, targets } = await extractor.inspect(context);
    expect(metadata).toMatchObject({ format: "Figma", title: "circle", version: "Kiwi v101", pageCount: 1, nodeCount: 2, hasThumbnail: true });
    expect(targets).toEqual([{ id: "page:1", title: "Page 1", kind: "page", size: 2 }]);
    const { content } = await extractor.read(context, { target: "page:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(content.split("\n").slice(2)).toEqual(["- [artboard] Frame 1 (350×350)", "  - [ellipse] Ellipse 1 (300×300)"]);
  });

  it("quotes Sketch text layer contents", async () => {
    const context = contextFor("colored-strings.sketch");
    expect((await extractor.inspect(context)).metadata).toMatchObject({ format: "Sketch", textNodeCount: 2, fonts: ["Helvetica"] });
    const { content } = await extractor.read(context, { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(content).toContain("- [text] Hard coded color (298×123)\n  > Hard coded color");
    expect(content).toContain("  > Color variable");
    expect(content).not.toMatch(/PNG|base64/);
  });
});
