import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROBE_TOTAL_BYTES } from "./probe-limits";
import { probeNonNativeVideo } from "./probe";

function fixture(name: string) {
  return new File([readFileSync(join(process.cwd(), "examples", name))], name);
}

function context(file: File, signal = new AbortController().signal) {
  return { file, signal };
}

beforeEach(() => {
  vi.stubGlobal("VideoDecoder", class VideoDecoder {});
  vi.stubGlobal("AudioDecoder", class AudioDecoder {});
  vi.stubGlobal("AudioContext", class AudioContext {});
});

afterEach(() => vi.unstubAllGlobals());

describe("non-native video Matroska probe", () => {
  it.each([
    "mkv-avc-aac.mkv",
    "mkv-hevc-flac.mkv",
    "mkv-vp8-vorbis.mkv",
    "mkv-vp9-opus.mkv",
    "mkv-av1-mp3.mkv",
    "mkv-avc-video-only.mkv",
  ])("accepts the declared codec path in %s", async (name) => {
    expect(await probeNonNativeVideo(context(fixture(name)))).toBe(3);
  });

  it.each([
    "mkv-opus-audio-only.mkv",
    "mkv-unsupported-mpeg4.mkv",
    "mkv-no-cues.mkv",
    "disguised-mp4.mkv",
    "truncated.mkv",
    "corrupt.mkv",
  ])("rejects unsupported, incomplete or disguised input %s", async (name) => {
    expect(await probeNonNativeVideo(context(fixture(name)))).toBe(0);
  });

  it("checks only the capabilities required by the file", async () => {
    vi.stubGlobal("AudioDecoder", undefined);
    vi.stubGlobal("AudioContext", undefined);
    expect(await probeNonNativeVideo(context(fixture("mkv-avc-video-only.mkv")))).toBe(3);
    expect(await probeNonNativeVideo(context(fixture("mkv-avc-aac.mkv")))).toBe(0);
  });

  it("accepts the same Matroska evidence through the mk3d route", async () => {
    const source = fixture("mkv-vp9-opus.mkv");
    const file = new File([source], "stereo.mk3d");
    expect(await probeNonNativeVideo(context(file))).toBe(3);
  });

  it("keeps reads bounded to the probe budget", async () => {
    const source = fixture("mkv-avc-aac.mkv");
    const padding = new Uint8Array(PROBE_TOTAL_BYTES * 2);
    const file = new File([source, padding, source], "large.mkv");
    let bytesRequested = 0;
    const originalSlice = file.slice.bind(file);
    vi.spyOn(file, "slice").mockImplementation((start, end, type) => {
      bytesRequested += Number(end ?? file.size) - Number(start ?? 0);
      return originalSlice(start, end, type);
    });

    await probeNonNativeVideo(context(file));
    expect(bytesRequested).toBeLessThanOrEqual(PROBE_TOTAL_BYTES);
  });

  it("propagates cancellation as AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeNonNativeVideo(context(fixture("mkv-avc-aac.mkv"), controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
