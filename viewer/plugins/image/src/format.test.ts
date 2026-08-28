import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { inspectImageFile } from "./format";

function fixture(name: string) {
  return new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
}

describe("browser image format inspection", () => {
  it.each([
    ["sample.jpg", "JPEG", false, undefined],
    ["sample.png", "PNG", false, undefined],
    ["animated.apng", "APNG", true, 14],
    ["animated.gif", "GIF", true, 2],
    ["animated.webp", "WebP", true, 2],
    ["sample-lossy.webp", "WebP", false, undefined],
    ["sample-lossless-alpha.webp", "WebP", false, undefined],
    ["sample.avif", "AVIF", false, undefined],
  ] as const)("inspects the real %s fixture", (fileName, format, animated, frameCount) => {
    const info = inspectImageFile(fixture(fileName), true);

    expect(info).toMatchObject({ format, animated });
    if (format !== "AVIF") {
      expect(info?.width).toBe(96);
      expect(info?.height).toBe(64);
    }
    if (animated) expect(info?.frameCount).toBe(frameCount);
  });

  it.each(["corrupt.jpg", "corrupt.png", "corrupt.gif", "corrupt.webp", "corrupt.avif", "truncated.avif"])(
    "rejects the incomplete %s container",
    (fileName) => expect(inspectImageFile(fixture(fileName), true)).toBeUndefined(),
  );

  it("uses the WebP animation flag when frame chunks are outside the inspected header", () => {
    const header = fixture("animated.webp").slice(0, 30);

    expect(inspectImageFile(header)).toMatchObject({
      format: "WebP",
      animated: true,
      frameCount: undefined,
    });
  });

  it("records alpha for the PNG and lossless WebP fixtures", () => {
    expect(inspectImageFile(fixture("sample.png"), true)?.hasAlpha).toBe(true);
    expect(inspectImageFile(fixture("sample-lossless-alpha.webp"), true)?.hasAlpha).toBe(true);
  });
});
