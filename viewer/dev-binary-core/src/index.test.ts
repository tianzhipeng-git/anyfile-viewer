import { describe, expect, it } from "vitest";

import { BinaryCursor, FileByteSource, assertSafeRange } from "./index";

describe("dev binary core", () => {
  it("reads bounded chunks and ULEB values", async () => {
    const source = new FileByteSource(new File([Uint8Array.of(0xe5, 0x8e, 0x26, 9)], "value.bin"), new AbortController().signal);
    const cursor = new BinaryCursor(source, 0, source.size, 2);
    await expect(cursor.readULEBNumber()).resolves.toBe(624485);
    await expect(cursor.readByte()).resolves.toBe(9);
  });

  it("rejects bad ranges, malformed values, and cancellation", async () => {
    expect(() => assertSafeRange(4, 3, 2)).toThrow(RangeError);
    const malformed = new BinaryCursor(new FileByteSource(
      new File([Uint8Array.of(0x80, 0x80, 0x80, 0x80, 0x80)], "malformed.bin"),
      new AbortController().signal,
    ));
    await expect(malformed.readULEBNumber(32)).rejects.toThrow(RangeError);

    const controller = new AbortController();
    controller.abort();
    const source = new FileByteSource(new File([Uint8Array.of(1)], "cancelled.bin"), controller.signal);
    await expect(source.read(0, 1)).rejects.toMatchObject({ name: "AbortError" });
  });
});
