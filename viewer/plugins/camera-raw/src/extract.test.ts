// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import type { ExtractContext, VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const SAMPLE = resolve(__dirname, "../examples/blackmagic-micro-cinema-camera.dng");
/** Repository `public/vendor/` (dev layout); the compliance suite itself uses the real Node vendor resolver. */
const VENDOR_ROOT = resolve(__dirname, "../../../../public/vendor");
const vendor: VendorAssets = {
  url: async (path) => pathToFileURL(resolve(VENDOR_ROOT, path)).href,
  bytes: async (path) => new Uint8Array(readFileSync(resolve(VENDOR_ROOT, path))),
};

function makeContext(name: string, bytes: Uint8Array): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([new Uint8Array(bytes)], name),
    vendor,
    signal: new AbortController().signal,
  };
}

describe("camera-raw ./extract", () => {
  it("passes extractor compliance on a real DNG", async () => {
    await assertExtractorCompliance(extractor, [{
      name: "blackmagic-micro-cinema-camera.dng",
      filePath: SAMPLE,
      invalidBytes: new TextEncoder().encode("II*\0 not a raw file"),
      filter: "camera",
      smallMaxBytes: 64,
    }]);
  }, 60_000);

  it("reports LibRaw metadata and renders a bounded half-size development", async () => {
    const context = makeContext("sample.dng", new Uint8Array(readFileSync(SAMPLE)));
    const { metadata } = await extractor.inspect(context);
    expect(metadata).toMatchObject({
      format: "DNG", make: "Blackmagic", model: "Micro Cinema Camera", width: 1952, height: 1104,
      dngVersion: "1.2.0.0", cfaPattern: "RGBG", embeddedPreview: null, gps: false,
    });
    expect(metadata).not.toHaveProperty("iso");

    const full = await extractor.renderImage!(context, { maxDimension: 4096 });
    expect([full.width, full.height]).toEqual([976, 552]);
    const thumb = await extractor.renderImage!(context, { maxDimension: 200 });
    expect([thumb.width, thumb.height]).toEqual([200, 113]);
    let lit = 0;
    for (let i = 0; i < thumb.data.length; i += 4) if (thumb.data[i] + thumb.data[i + 1] + thumb.data[i + 2] > 30) lit++;
    expect(lit).toBeGreaterThan(thumb.width * thumb.height * 0.5);
    expect(thumb.data[3]).toBe(255);

    await expect(extractor.renderImage!(context, { target: "image:1", maxDimension: 64 })).rejects.toMatchObject({ code: "target-not-found" });
    await expect(extractor.renderImage!(context, { maxDimension: 0 })).rejects.toMatchObject({ code: "invalid-argument" });
  }, 60_000);
});
