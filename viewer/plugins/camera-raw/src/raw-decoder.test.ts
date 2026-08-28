import { describe, expect, it } from "vitest";
import { summarizeRawMetadata } from "./raw-decoder";

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
});
