import { describe, expect, it } from "vitest";

import { checkRawDimensions, summarizeRawMetadata } from "./index";

describe("RAW metadata", () => {
  it("maps the camera fields exposed by libraw-wasm", () => {
    expect(summarizeRawMetadata({
      camera_make: " Canon ",
      camera_model: " EOS R5 ",
      width: 8192,
      height: 5464,
      iso_speed: 400,
    })).toEqual({ make: "Canon", model: "EOS R5", width: 8192, height: 5464, iso: 400 });
  });

  it("allows the X6-sized 120-megapixel RAW source within the 128 MiPixel limit", () => {
    expect(checkRawDimensions(15_520, 7_760)).toBe(120_435_200);
    expect(() => checkRawDimensions(16_385, 8_192)).toThrow(/128-megapixel/);
  });
});
