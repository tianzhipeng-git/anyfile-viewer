import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { inspectImageFile } from "./format";

function fixture(name: string) {
  return new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
}

describe("browser image format inspection", () => {
  it.each([
    ["sample.jpg", "JPEG", false, undefined, 96, 64],
    ["sample.png", "PNG", false, undefined, 96, 64],
    ["animated.apng", "APNG", true, 14, 96, 64],
    ["animated.gif", "GIF", true, 2, 96, 64],
    ["animated.webp", "WebP", true, 2, 96, 64],
    ["sample-lossy.webp", "WebP", false, undefined, 96, 64],
    ["sample-lossless-alpha.webp", "WebP", false, undefined, 96, 64],
    ["sample.avif", "AVIF", false, undefined, undefined, undefined],
    ["animated.avif", "AVIF", true, undefined, undefined, undefined],
    ["sample.bmp", "BMP", false, undefined, 96, 64],
    ["sample.ico", "ICO", false, undefined, 96, 96],
    ["sample.cur", "CUR", false, undefined, 96, 96],
  ] as const)("inspects the real %s fixture", (fileName, format, animated, frameCount, width, height) => {
    const info = inspectImageFile(fixture(fileName), true);

    expect(info).toMatchObject({ format, animated });
    if (width !== undefined) expect(info?.width).toBe(width);
    if (height !== undefined) expect(info?.height).toBe(height);
    if (animated) expect(info?.frameCount).toBe(frameCount);
  });

  it.each([
    "corrupt.jpg", "corrupt.png", "corrupt.gif", "corrupt.webp", "corrupt.avif",
    "corrupt.bmp", "corrupt.ico", "truncated.avif", "truncated.bmp", "truncated.ico",
  ])(
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
