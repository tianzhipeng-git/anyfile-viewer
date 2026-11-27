// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const SAMPLE = resolve(process.cwd(), "examples/sintel.torrent");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

describe("torrent ./extract", () => {
  it("passes extractor compliance on the real Sintel torrent", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "sintel.torrent",
        filePath: SAMPLE,
        invalidBytes: new TextEncoder().encode("not a torrent"),
        targetId: "files",
        unsupportedFilterTargetId: "summary",
        filter: "srt",
        smallMaxBytes: 160,
      },
    ]);
  });

  it("exposes metadata, file list and trackers", async () => {
    const bytes = new Uint8Array(readFileSync(SAMPLE));
    const context = {
      source: createBufferBinarySource(bytes, "sintel.torrent", SAMPLE),
      file: new File([bytes], "sintel.torrent"),
      vendor: NOOP_VENDOR,
      signal: new AbortController().signal,
    };
    const inspected = await extractor.inspect(context);
    expect(inspected.metadata).toMatchObject({ name: "Sintel", fileCount: 11 });
    expect(inspected.metadata.infoHash).toMatch(/^[0-9a-f]{40}$/);

    const files = await extractor.read(context, { target: "files", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(files.content).toContain("| Sintel.mp4 |");
    const subtitles = await extractor.read(context, { target: "files", filter: ".srt", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(subtitles.content).not.toContain("Sintel.mp4");
    const trackers = await extractor.read(context, { target: "trackers", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(trackers.content).toMatch(/udp:\/\/|wss:\/\//);
  });
});
