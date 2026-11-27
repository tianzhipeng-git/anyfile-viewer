// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentError, DEFAULT_READ_MAX_BYTES, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

describe("plist ./extract compliance", () => {
  it("passes extractor compliance on binary and XML plist fixtures", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "app-config.binary.plist",
        filePath: resolve(EXAMPLES, "app-config.binary.plist"),
        invalidBytes: new TextEncoder().encode("not a plist"),
        filter: "a",
        smallMaxBytes: 120,
      },
      {
        name: "app-config.xml.plist",
        filePath: resolve(EXAMPLES, "app-config.xml.plist"),
        smallMaxBytes: 160,
      },
    ]);
  });

  it("maps malformed percent-encoded key targets to target-not-found", async () => {
    const filePath = resolve(EXAMPLES, "app-config.binary.plist");
    const bytes = new Uint8Array(readFileSync(filePath));
    const context = {
      source: createBufferBinarySource(bytes, "app-config.binary.plist", filePath),
      file: new File([bytes], "app-config.binary.plist"),
      vendor: NOOP_VENDOR,
      signal: new AbortController().signal,
    };
    await expect(
      extractor.read(context, { target: "key:%E0%A4%A", maxBytes: DEFAULT_READ_MAX_BYTES }),
    ).rejects.toMatchObject({ code: "target-not-found" } satisfies Partial<AgentError>);
  });
});
