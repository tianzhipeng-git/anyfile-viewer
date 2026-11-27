// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { DEFAULT_READ_MAX_BYTES } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

describe("pst ./extract compliance", () => {
  it("passes extractor compliance on real Outlook PST fixture", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "dist-list.pst",
        filePath: resolve(EXAMPLES, "dist-list.pst"),
        invalidBytes: new TextEncoder().encode("not a pst archive"),
        filter: "e",
        smallMaxBytes: 256,
      },
    ]);
  });

  it("reads message:<nid> targets and reports filterApplied: false when filter is unsupported", async () => {
    const filePath = resolve(EXAMPLES, "dist-list.pst");
    const bytes = new Uint8Array(readFileSync(filePath));
    const context = {
      source: createBufferBinarySource(bytes, "dist-list.pst", filePath),
      file: new File([bytes], "dist-list.pst"),
      vendor: createNodeVendorAssets(),
      signal: new AbortController().signal,
    };

    const inspected = await extractor.inspect(context);
    let messageTarget: string | undefined;
    for (const folder of inspected.targets.filter((t) => (t.size ?? 0) > 0)) {
      const listing = await extractor.read(context, {
        target: folder.id,
        maxBytes: DEFAULT_READ_MAX_BYTES,
      });
      const match = /\|\s*(message:[0-9a-f]+)\s*\|/i.exec(listing.content);
      if (match) {
        messageTarget = match[1];
        break;
      }
    }
    expect(messageTarget).toBeDefined();

    const message = await extractor.read(context, {
      target: messageTarget!,
      filter: "ignored",
      maxBytes: DEFAULT_READ_MAX_BYTES,
    });
    expect(message.contentType).toBe("markdown");
    expect(message.content).toContain("## Body");
    expect(message.filterApplied).toBe(false);
  });
});
