// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import { describe, expect, it } from "vitest";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function contextFor(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
  return { source: createBufferBinarySource(bytes, name), file: new File([bytes], name), vendor: NOOP_VENDOR, signal: new AbortController().signal };
}

describe("ml-weights ./extract", () => {
  it("passes extractor compliance on GGUF and safetensors samples", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "stories260K.gguf", filePath: resolve(EXAMPLES, "stories260K.gguf"), filter: "llama", smallMaxBytes: 300, invalidBytes: new TextEncoder().encode("GGUF but not really a model") },
      { name: "tiny-random-bert.safetensors", filePath: resolve(EXAMPLES, "tiny-random-bert.safetensors"), targetId: "tensors", filter: "attention" },
    ]);
  });

  it("summarizes GGUF metadata and pages the tensor table without reading weights", async () => {
    const context = contextFor("stories260K.gguf");
    const reads: number[] = [];
    const source = context.source;
    const tracked = { ...context, source: { ...source, read: (offset: number, length: number, signal?: AbortSignal) => (reads.push(offset + length), source.read(offset, length, signal)) } };
    const inspected = await extractor.inspect(tracked);
    expect(inspected.metadata).toMatchObject({ format: "gguf", architecture: "llama", tensorCount: 48 });
    expect(inspected.targets.map((t) => t.id)).toEqual(["metadata", "tensors"]);

    expect((await extractor.read(tracked, { maxBytes: 48 * 1024 })).content).toContain("| general.architecture | llama |");
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await extractor.read(tracked, { target: "tensors", cursor, maxBytes: 500 });
      names.push(...page.content.split("\n").slice(2).map((line) => line.split(" | ")[0].slice(2)));
      cursor = page.nextCursor;
    } while (cursor);
    expect(names).toHaveLength(48);
    expect(new Set(names).size).toBe(48);
    expect(names).toContain("token_embd.weight");

    const bert = await extractor.inspect(contextFor("tiny-random-bert.safetensors"));
    expect(bert.metadata).toMatchObject({ format: "safetensors", tensorCount: 100 });
    expect(Math.max(...reads)).toBeLessThan(source.size);
  });
});
