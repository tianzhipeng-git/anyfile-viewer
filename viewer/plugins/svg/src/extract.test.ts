// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR = { url: async () => "", bytes: async () => new Uint8Array() };

function contextFor(bytes: Uint8Array, name: string): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([new Uint8Array(bytes)], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

describe("svg ./extract", () => {
  it("passes extractor compliance on real examples", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "pipeline-labels.svg",
        filePath: resolve(EXAMPLES, "pipeline-labels.svg"),
        invalidBytes: new TextEncoder().encode("<html><body>not svg</body></html>"),
        filter: "e",
        smallMaxBytes: 64,
      },
      { name: "pipeline-labels.svg", filePath: resolve(EXAMPLES, "pipeline-labels.svg"), targetId: "source", filter: "text", smallMaxBytes: 200 },
      { name: "sample.svg", filePath: resolve(EXAMPLES, "sample.svg") },
    ]);
  }, 30_000);

  it("reports dimensions, text and embedded content", async () => {
    const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, "pipeline-labels.svg")));
    const context = contextFor(bytes, "pipeline-labels.svg");
    const { metadata, targets } = await extractor.inspect(context);
    expect(metadata).toMatchObject({
      format: "SVG", width: "320", height: "200", viewBox: "0 0 320 200",
      title: "Release pipeline", embeddedImages: 1, externalImages: 0, scripts: 0,
    });
    expect((metadata.elementCounts as Record<string, number>).rect).toBe(3);
    expect(targets.map((target) => target.id)).toEqual(["text", "source"]);

    const text = await extractor.read(context, { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(text.content.split("\n")).toEqual([
      "[title] Release pipeline",
      "[desc] Three build stages with a legend and an embedded thumbnail.",
      "Build", "Test 测试", "Deploy",
      "Legend:", "blue = compile", "green = verify",
    ]);

    const source = await extractor.read(context, { target: "source", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(source.content).toContain('xlink:href="data:image/png;base64,<binary ');
    expect(source.content).not.toMatch(/base64,iVBOR/);
  });

  it("decompresses SVGZ", async () => {
    const bytes = new Uint8Array(gzipSync(readFileSync(resolve(EXAMPLES, "pipeline-labels.svg"))));
    const context = contextFor(bytes, "pipeline-labels.svgz");
    expect((await extractor.inspect(context)).metadata.format).toBe("SVGZ");
    expect((await extractor.read(context, { maxBytes: DEFAULT_READ_MAX_BYTES })).content).toContain("Deploy");
  });
});
