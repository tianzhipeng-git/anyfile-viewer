import { writePsd } from "ag-psd";
import { describe, expect, it } from "vitest";

import { decodePhotoshop } from "./decode";

describe("Photoshop decoder", () => {
  it("decodes the saved PSD composite and layer summary", () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const buffer = writePsd({
      width: 2,
      height: 1,
      imageData: { width: 2, height: 1, data: source },
      children: [{ name: "Visible" }, { name: "Hidden", hidden: true }],
    });

    const decoded = decodePhotoshop(buffer);

    expect(decoded.rgba).toEqual(source);
    expect(decoded.info).toMatchObject({ width: 2, height: 1, colorMode: "RGB", layerCount: 2, visibleLayerCount: 1 });
  });

  it("decodes a saved PSB composite", () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const buffer = writePsd({
      width: 2,
      height: 1,
      imageData: { width: 2, height: 1, data: source },
    }, { psb: true });

    expect(new DataView(buffer).getUint16(4)).toBe(2);
    const decoded = decodePhotoshop(buffer);

    expect(decoded.rgba).toEqual(source);
    expect(decoded.info).toMatchObject({ width: 2, height: 1, colorMode: "RGB" });
  });
});
