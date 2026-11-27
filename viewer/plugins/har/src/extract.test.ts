// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HARD_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const SAMPLE = resolve(process.cwd(), "examples/network.har");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function context(bytes: Uint8Array = new Uint8Array(readFileSync(SAMPLE))): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, "network.har"),
    file: new File([new Uint8Array(bytes)], "network.har"),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

function har(entries: readonly { url: string; text: string; encoding?: string }[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    log: {
      version: "1.2",
      entries: entries.map(({ url, text, encoding }) => ({
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 5,
        request: { method: "GET", url, headers: [] },
        response: { status: 200, headers: [], content: { size: text.length, mimeType: "application/octet-stream", text, encoding } },
      })),
    },
  }));
}

describe("har ./extract", () => {
  it("passes extractor compliance on the sample capture", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "network.har", filePath: SAMPLE, invalidBytes: new TextEncoder().encode("{\"log\":{}}"), filter: "post", smallMaxBytes: 200 },
      { name: "network.har", filePath: SAMPLE, targetId: "entry:2", filter: "content", smallMaxBytes: 120 },
    ]);
  });

  it("summarizes hosts and time span and lists requests", async () => {
    const inspected = await extractor.inspect(context());
    expect(inspected.metadata).toMatchObject({
      entryCount: 2,
      pageCount: 1,
      hosts: { "api.example.com": 2 },
      methods: { GET: 1, POST: 1 },
      firstStarted: "2026-08-29T08:00:00.010Z",
    });
    const table = await extractor.read(context(), { filter: "post", maxBytes: HARD_READ_MAX_BYTES });
    expect(table.content).toContain("| 2 | 2026-08-29T08:00:00.150Z | POST | 201 | https://api.example.com/v1/events |");
    expect(table.content).not.toContain("projects");
  });

  it("shows headers and size-capped bodies, never binary payloads", async () => {
    const detail = await extractor.read(context(), { target: "entry:1", maxBytes: HARD_READ_MAX_BYTES });
    expect(detail.content).toContain("- Content-Type: application/json; charset=utf-8");
    expect(detail.content).toContain("{\"projects\":[{\"id\":1,\"name\":\"Demo\"}]}");

    const bytes = har([
      { url: "https://cdn.example/big.txt", text: "y".repeat(40_000) },
      { url: "https://cdn.example/logo.png", text: btoa("\x89PNG\r\n\x1a\n\0\0"), encoding: "base64" },
      { url: "https://cdn.example/data.json", text: btoa("{\"ok\":true}"), encoding: "base64" },
    ]);
    const big = await extractor.read(context(bytes), { target: "entry:1", maxBytes: HARD_READ_MAX_BYTES });
    expect(big.content).toContain("[body truncated to 16384 bytes]");
    expect(big.content.length).toBeLessThan(17_000);
    const png = await extractor.read(context(bytes), { target: "entry:2", maxBytes: HARD_READ_MAX_BYTES });
    expect(png.content).toContain("<binary body, 16 encoded chars; not shown>");
    const json = await extractor.read(context(bytes), { target: "entry:3", maxBytes: HARD_READ_MAX_BYTES });
    expect(json.content).toContain("{\"ok\":true}");
    await expect(extractor.read(context(bytes), { target: "entry:4", maxBytes: 1024 })).rejects.toMatchObject({ code: "target-not-found" });
  });

  it("bounds entry targets for large captures", async () => {
    const bytes = har(Array.from({ length: 60 }, (_, index) => ({ url: `https://example.test/${index}`, text: "" })));
    const inspected = await extractor.inspect(context(bytes));
    expect(inspected.targets).toHaveLength(51);
    expect(inspected.targetsTruncated).toBe(true);
  });
});
