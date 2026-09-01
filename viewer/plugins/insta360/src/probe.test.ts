import { describe, expect, it } from "vitest";

import { inspectInsta360File } from "./inspection";
import { probeInsta360 } from "./probe";
import { x3DngBytes, x3InsvBytes, x3LrvBytes, x3PhotoBytes } from "./test-fixtures";

function context(file: File, signal = new AbortController().signal) {
  return { file, signal };
}

describe("Insta360 X3 probe", () => {
  it("accepts only the verified X3 JPEG layout", async () => {
    const valid = new File([x3PhotoBytes()], "photo.insp");
    const otherModel = new File([x3PhotoBytes("Insta360 X4")], "photo.insp");
    expect(await inspectInsta360File(context(valid))).toMatchObject({ kind: "photo", width: 5952, height: 2976 });
    expect(await probeInsta360(context(valid))).toBe(3);
    expect(await probeInsta360(context(otherModel))).toBe(0);
    expect(await probeInsta360(context(new File([x3PhotoBytes()], "photo.jpg")))).toBe(0);
  });

  it("routes only the verified X3 top-bottom DNG layout", async () => {
    const valid = new File([x3DngBytes()], "photo.dng");
    await expect(inspectInsta360File(context(valid))).resolves.toEqual({
      kind: "raw", width: 2976, height: 5952, make: "Arashi Vision", model: "Insta360 X3",
    });
    await expect(probeInsta360(context(valid))).resolves.toBe(3);
    await expect(probeInsta360(context(new File([x3DngBytes({ model: "Other camera" })], "photo.dng")))).resolves.toBe(0);
    await expect(probeInsta360(context(new File([x3DngBytes({ width: 3000 })], "photo.dng")))).resolves.toBe(0);
    await expect(probeInsta360(context(new File([x3DngBytes({ dng: false })], "photo.dng")))).resolves.toBe(0);
  });

  it("uses the TIFF IFD offset for a bounded DNG directory read", async () => {
    const directoryOffset = 128 * 1024;
    const file = new File([x3DngBytes({ directoryOffset })], "photo.dng");
    const originalSlice = file.slice.bind(file);
    const reads: Array<{ start: number; end: number }> = [];
    Object.defineProperty(file, "slice", { value(start = 0, end = file.size, type?: string) {
      reads.push({ start: Number(start), end: Number(end) });
      return originalSlice(start, end, type);
    } });

    await expect(probeInsta360(context(file))).resolves.toBe(3);
    expect(reads).toEqual([
      { start: 0, end: 8 },
      { start: directoryOffset, end: file.size },
    ]);
  });

  it("locates moov from the extended mdat size and validates tracks", async () => {
    const valid = x3LrvBytes();
    const file = new File([valid.bytes], "proxy.lrv");
    const inspection = await inspectInsta360File(context(file));
    expect(inspection).toMatchObject({ kind: "video", width: 1024, height: 512, moovOffset: valid.moovOffset });
    expect(await probeInsta360(context(file))).toBe(3);

    const wrongLayout = x3LrvBytes({ width: 960 });
    expect(await probeInsta360(context(new File([wrongLayout.bytes], "proxy.lrv")))).toBe(0);
  });

  it("performs bounded, targeted reads instead of scanning the media payload", async () => {
    const fixture = x3LrvBytes({ padding: 300 * 1024 });
    const file = new File([fixture.bytes], "proxy.lrv");
    const originalSlice = file.slice.bind(file);
    const reads: Array<{ start: number; end: number }> = [];
    Object.defineProperty(file, "slice", { value(start = 0, end = file.size, type?: string) {
      reads.push({ start: Number(start), end: Number(end) });
      return originalSlice(start, end, type);
    } });

    expect(await probeInsta360(context(file))).toBe(3);
    expect(reads).toEqual([
      { start: 0, end: 64 * 1024 },
      { start: fixture.moovOffset, end: fixture.moovOffset + 16 },
      { start: fixture.moovOffset, end: fixture.moovOffset + fixture.moovBytes },
    ]);
  });

  it("accepts only strictly named X3 single-lens INSV files", async () => {
    const fixture = x3InsvBytes();
    const front = new File([fixture.bytes], "VID_20230813_194503_00_713.insv");
    await expect(inspectInsta360File(context(front))).resolves.toMatchObject({
      kind: "video", layout: "single", role: "00", width: 2880, height: 2880,
    });
    await expect(probeInsta360(context(front))).resolves.toBe(3);
    await expect(probeInsta360(context(new File([fixture.bytes], "unrelated.insv")))).resolves.toBe(0);
    await expect(probeInsta360(context(new File([x3LrvBytes().bytes], "VID_20230813_194503_10_713.insv")))).resolves.toBe(0);
  });

  it("preserves standard AbortError cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeInsta360(context(new File([x3PhotoBytes()], "photo.insp"), controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
