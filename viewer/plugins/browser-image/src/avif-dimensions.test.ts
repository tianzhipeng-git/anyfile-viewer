import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { avifDimensions } from "./avif-dimensions";
function box(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(8 + data.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  return bytes;
}
function image(width: number, height: number) {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(4, width);
  view.setUint32(8, height);
  const iprp = box("iprp", box("ipco", box("ispe", data)));
  const meta = new Uint8Array(4 + iprp.length);
  meta.set(iprp, 4);
  return box("meta", meta);
}
describe("AVIF predecode dimensions", () => {
  it("reads real static AVIF dimensions without decoding pixels", () => {
    const info = avifDimensions(
      new Uint8Array(readFileSync(join(process.cwd(), "examples/sample.avif"))),
    );
    expect(info?.width).toBeGreaterThan(0);
    expect(info?.height).toBeGreaterThan(0);
  });
  it("preserves oversized dimensions for the caller's pixel budget", () => {
    expect(avifDimensions(image(100_000, 100_000))).toEqual({ width: 100_000, height: 100_000 });
  });
  it("rejects truncated boxes, invalid extents and fake ispe text in payload", () => {
    expect(avifDimensions(image(100, 200).subarray(0, 30))).toBeUndefined();
    expect(avifDimensions(image(0, 200))).toBeUndefined();
    expect(avifDimensions(box("mdat", image(100, 200)))).toBeUndefined();
    const corrupt = image(100, 200);
    new DataView(corrupt.buffer).setUint32(0, 0xffffffff);
    expect(avifDimensions(corrupt)).toBeUndefined();
  });
});
