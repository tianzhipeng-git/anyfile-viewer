import { describe, expect, it } from "vitest";

import { inspectInsta360File } from "./inspection";
import { probeInsta360 } from "./probe";
import { modernInsvBytes, x3DngBytes, x3InsvBytes, x3LrvBytes, x3PhotoBytes } from "./test-fixtures";

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
      kind: "raw", device: "X3", width: 2976, height: 5952, layout: "tb", lensSize: 2976,
      make: "Arashi Vision", model: "Insta360 X3",
    });
    await expect(probeInsta360(context(valid))).resolves.toBe(3);
    await expect(probeInsta360(context(new File([x3DngBytes({ model: "Other camera" })], "photo.dng")))).resolves.toBe(0);
    await expect(probeInsta360(context(new File([x3DngBytes({ width: 3000 })], "photo.dng")))).resolves.toBe(0);
    await expect(probeInsta360(context(new File([x3DngBytes({ dng: false })], "photo.dng")))).resolves.toBe(0);

    const x6 = new File([x3DngBytes({ model: "Insta360 X6", width: 15520, height: 7760 })], "x6.dng");
    await expect(inspectInsta360File(context(x6))).resolves.toMatchObject({
      kind: "raw", device: "X6", width: 15520, height: 7760, layout: "sbs", lensSize: 7760,
    });
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

  it("accepts strictly named X3 paired-file INSV files", async () => {
    const fixture = x3InsvBytes();
    const front = new File([fixture.bytes], "VID_20230813_194503_00_713.insv");
    await expect(inspectInsta360File(context(front))).resolves.toMatchObject({
      kind: "video", device: "X3", layout: "paired-files", role: "00", width: 2880, height: 2880,
    });
    await expect(probeInsta360(context(front))).resolves.toBe(3);
    await expect(probeInsta360(context(new File([fixture.bytes], "unrelated.insv")))).resolves.toBe(0);
    await expect(probeInsta360(context(new File([x3LrvBytes().bytes], "VID_20230813_194503_10_713.insv")))).resolves.toBe(0);
  });

  it("recognizes One RS, X4 proxy and model-specific single-file dual-track layouts", async () => {
    const oneRs = x3InsvBytes({ width: 3072 });
    await expect(inspectInsta360File(context(new File([oneRs.bytes], "VID_20220625_140410_00_008.insv"))))
      .resolves.toMatchObject({ device: "One RS", layout: "paired-files", width: 3072, height: 3072 });

    const oneRsProxy = x3LrvBytes({ width: 768, height: 384 });
    await expect(inspectInsta360File(context(new File([oneRsProxy.bytes], "LRV_20220625_140410_11_008.insv"))))
      .resolves.toMatchObject({ device: "One RS", layout: "sbs", width: 768, height: 384 });

    const x4Proxy = x3LrvBytes({ width: 1664, height: 832 });
    await expect(inspectInsta360File(context(new File([x4Proxy.bytes], "LRV_20240414_135511_01_027.lrv"))))
      .resolves.toMatchObject({ device: "X4", layout: "sbs", width: 1664, height: 832 });

    const modern = modernInsvBytes();
    await expect(inspectInsta360File(context(new File([modern.bytes], "any-name.insv"))))
      .resolves.toMatchObject({ device: "X5", layout: "dual-track", width: 3840, height: 3840, projection: { kind: "mei" } });
    await expect(probeInsta360(context(new File([modern.bytes], "any-name.insv")))).resolves.toBe(3);

    const missingLens = modernInsvBytes({ videoTracks: 1 });
    await expect(probeInsta360(context(new File([missingLens.bytes], "any-name.insv")))).resolves.toBe(0);

    const x6 = modernInsvBytes({ model: "X6" });
    await expect(inspectInsta360File(context(new File([x6.bytes], "x6.insv"))))
      .resolves.toMatchObject({ device: "X6", layout: "dual-track" });

    const x4 = modernInsvBytes({ model: "X4" });
    await expect(inspectInsta360File(context(new File([x4.bytes], "x4.insv"))))
      .resolves.toMatchObject({ device: "X4", layout: "dual-track", projection: { kind: "mei" } });
  });

  it("preserves standard AbortError cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeInsta360(context(new File([x3PhotoBytes()], "photo.insp"), controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
