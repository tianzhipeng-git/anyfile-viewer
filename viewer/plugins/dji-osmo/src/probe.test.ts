import { describe, expect, it } from "vitest";

import { DJI_OSMO_PHOTO_PROBE_BUDGET, inspectDjiOsmoFile } from "./inspection";
import { probeDjiOsmo } from "./probe";
import { projectDjiOsmoDirection } from "./projection";
import { djiOsmoPhotoBytes, djiOsmoVideoBytes } from "./test-fixtures";
import { DJI_OSMO_VIDEO_PROBE_BUDGET } from "./video-inspection";

const context = (file: File, signal = new AbortController().signal) => ({ file, signal });

describe("DJI Osmo probe", () => {
  it("recognizes the verified OQ001 equirectangular JPEG", async () => {
    const file = new File([djiOsmoPhotoBytes()], "panorama.JPG");
    await expect(inspectDjiOsmoFile(context(file))).resolves.toEqual({ kind: "photo", device: "Osmo 360", width: 15520, height: 7760 });
    await expect(probeDjiOsmo(context(file))).resolves.toBe(5);
    await expect(probeDjiOsmo(context(new File([djiOsmoPhotoBytes("Other")], "photo.jpg")))).resolves.toBe(0);
  });

  it("recognizes two 3840-square HEVC lens tracks and ignores the thumbnail", async () => {
    const file = new File([djiOsmoVideoBytes()], "capture.OSV");
    await expect(inspectDjiOsmoFile(context(file))).resolves.toMatchObject({ kind: "video", device: "Osmo 360", width: 3840, height: 3840 });
    await expect(probeDjiOsmo(context(file))).resolves.toBe(3);
  });

  it("rejects MP4 lookalikes and unsupported layouts", async () => {
    await expect(probeDjiOsmo(context(new File([djiOsmoVideoBytes({ signature: false })], "capture.osv")))).resolves.toBe(0);
    await expect(probeDjiOsmo(context(new File([djiOsmoVideoBytes({ videoTracks: 1 })], "capture.osv")))).resolves.toBe(0);
    await expect(probeDjiOsmo(context(new File([djiOsmoVideoBytes({ width: 1920 })], "capture.osv")))).resolves.toBe(0);
  });

  it("uses a calibrated, opposite-facing dual-fisheye projection", () => {
    const front = projectDjiOsmoDirection([0, 0, -1], 0);
    const back = projectDjiOsmoDirection([0, 0, 1], 1);
    expect(front?.u).toBeCloseTo(0.5018217246, 8);
    expect(front?.v).toBeCloseTo(0.5017294851, 8);
    expect(back?.u).toBeCloseTo(0.5047001077, 8);
    expect(back?.v).toBeCloseTo(0.5061643697, 8);
    expect(projectDjiOsmoDirection([0, 0, 1], 0)).toBeUndefined();
  });

  it("cancels and keeps declared reads bounded", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeDjiOsmo(context(new File([djiOsmoPhotoBytes()], "photo.jpg"), controller.signal))).rejects.toMatchObject({ name: "AbortError" });
    expect(DJI_OSMO_PHOTO_PROBE_BUDGET).toBe(256 * 1024);
    expect(DJI_OSMO_VIDEO_PROBE_BUDGET).toBeLessThanOrEqual(3 * 1024 * 1024);
  });
});
