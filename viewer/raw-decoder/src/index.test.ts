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

  it("keeps full RAW development within the 64 MiPixel memory limit", () => {
    expect(checkRawDimensions(8_192, 8_192)).toBe(67_108_864);
    expect(() => checkRawDimensions(8_193, 8_192)).toThrow(/64-megapixel/);
  });
});
