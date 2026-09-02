import { describe, expect, it } from "vitest";

import { yuv420ToRgba } from "./embedded-preview";

describe("embedded INSV preview", () => {
  it("converts the indexed I420 frame to opaque RGBA", () => {
    const rgba = yuv420ToRgba(new Uint8Array([16, 235, 81, 145, 128, 128]), 2, 2);
    expect([...rgba]).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      76, 76, 76, 255,
      150, 150, 150, 255,
    ]);
  });
});
