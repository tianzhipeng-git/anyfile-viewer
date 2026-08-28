import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("HEIC native decoding", () => {
  it("does not use an image element when ImageDecoder is unavailable", async () => {
    const ImageElement = vi.fn(() => { throw new Error("image fallback must not run"); });
    vi.stubGlobal("ImageDecoder", undefined);
    vi.stubGlobal("Image", ImageElement);
    const { NativeImageSequence } = await import("./native");
    expect(await NativeImageSequence.open(new File(["heic"], "image.heic"), ["image/heic", "image/heif"], false)).toBeUndefined();
    expect(ImageElement).not.toHaveBeenCalled();
  });
});
