import { describe, expect, it } from "vitest";

import { GOPRO_MAX_PHOTO_PROBE_BUDGET, inspectGoProMaxFile } from "./inspection";
import { probeGoProMax } from "./probe";
import { goProMaxPhotoBytes, goProMaxVideoBytes } from "./test-fixtures";
import { GOPRO_MAX_VIDEO_PROBE_BUDGET } from "./video-inspection";

const context = (file: File, signal = new AbortController().signal) => ({ file, signal });

describe("GoPro MAX probe", () => {
  it("recognizes verified equirectangular JPEG metadata", async () => {
    const file = new File([goProMaxPhotoBytes()], "photo.JPG");
    await expect(inspectGoProMaxFile(context(file))).resolves.toEqual({ kind: "photo", device: "MAX", width: 5760, height: 2880 });
    await expect(probeGoProMax(context(file))).resolves.toBe(5);
    await expect(probeGoProMax(context(new File([goProMaxPhotoBytes("Other")], "photo.jpg")))).resolves.toBe(0);
  });

  it.each([
    [4096, 1344, "MAX"],
    [5952, 1920, "MAX2"],
  ] as const)("recognizes the %s × %s dual-track layout", async (width, height, device) => {
    const file = new File([goProMaxVideoBytes({ width, height })], "capture.360");
    await expect(inspectGoProMaxFile(context(file))).resolves.toMatchObject({ kind: "video", device, width, height });
    await expect(probeGoProMax(context(file))).resolves.toBe(3);
  });

  it("rejects lookalike MP4 files", async () => {
    await expect(probeGoProMax(context(new File([goProMaxVideoBytes({ videoTracks: 1 })], "capture.360")))).resolves.toBe(0);
    await expect(probeGoProMax(context(new File([goProMaxVideoBytes({ brand: false })], "capture.360")))).resolves.toBe(0);
  });

  it("cancels and keeps declared probe reads bounded", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeGoProMax(context(new File([goProMaxPhotoBytes()], "photo.jpg"), controller.signal))).rejects.toMatchObject({ name: "AbortError" });
    expect(GOPRO_MAX_PHOTO_PROBE_BUDGET).toBe(256 * 1024);
    expect(GOPRO_MAX_VIDEO_PROBE_BUDGET).toBeLessThanOrEqual(3 * 1024 * 1024);
  });
});
