import { describe, expect, it } from "vitest";

import {
  assertReadsWithin,
  createTrackedFile,
  integerBytes,
  signedVarint,
  truncated,
  unsignedVarint,
} from "./index";

describe("binary fixture helpers", () => {
  it("encodes integers and signed or unsigned varints", () => {
    expect(integerBytes(0x1234, 2, "big")).toEqual(Uint8Array.of(0x12, 0x34));
    expect(integerBytes(0x1234, 2, "little")).toEqual(Uint8Array.of(0x34, 0x12));
    expect(unsignedVarint(624485)).toEqual(Uint8Array.of(0xe5, 0x8e, 0x26));
    expect(signedVarint(-123456)).toEqual(Uint8Array.of(0xc0, 0xbb, 0x78));
  });

  it("tracks and validates file slice reads", async () => {
    const { file, reads } = createTrackedFile(Uint8Array.of(1, 2, 3, 4), "sample.bin");
    await file.slice(1, 3).arrayBuffer();
    expect(() => assertReadsWithin(reads, [{ start: 1, end: 3 }])).not.toThrow();
    expect(() => assertReadsWithin(reads, [{ start: 0, end: 1 }])).toThrow(/Unexpected fixture read/);
  });

  it("creates strict truncated copies", () => {
    expect(truncated(Uint8Array.of(1, 2, 3), 2)).toEqual(Uint8Array.of(1, 2));
    expect(() => truncated(Uint8Array.of(1), 1)).toThrow(RangeError);
  });
});
