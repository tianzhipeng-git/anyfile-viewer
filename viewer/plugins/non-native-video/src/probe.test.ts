import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROBE_TOTAL_BYTES } from "./probe-limits";
import { probeNonNativeVideo } from "./probe";

function fixture(name: string) {
  return new File(
    [readFileSync(join(process.cwd(), "examples", name))],
    name.replace(/\.fixture$/, ""),
  );
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
  it("rejects a file without an extension", async () => {
    expect(await probeNonNativeVideo(context(new File(["p"], "clip")))).toBe(0);
  });

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

  it("rejects an unknown-size Matroska file truncated after its SeekHead", async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", "mkv-avc-aac.mkv")));
    const segmentOffset = bytes.findIndex((value, offset) => value === 0x18
      && bytes[offset + 1] === 0x53
      && bytes[offset + 2] === 0x80
      && bytes[offset + 3] === 0x67);
    expect(segmentOffset).toBeGreaterThanOrEqual(0);
    bytes[segmentOffset + 4] = 0x01;
    bytes.fill(0xff, segmentOffset + 5, segmentOffset + 12);

    const file = new File([bytes.subarray(0, 20_000)], "truncated-stream.mkv");
    expect(await probeNonNativeVideo(context(file))).toBe(0);
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

describe("non-native video MPEG-TS probe", () => {
  it.each([
    "ts-avc-aac.ts.fixture",
    "ts-hevc-mp3.m2t",
    "ts-avc-video-only.m2ts",
  ])("accepts the declared transport stream path in %s", async (name) => {
    expect(await probeNonNativeVideo(context(fixture(name)))).toBe(3);
  });

  it.each([
    "ts-aac-audio-only.ts.fixture",
    "ts-unsupported-mpeg2video.ts.fixture",
    "ts-unsupported-ac3.ts.fixture",
    "disguised-matroska.ts.fixture",
    "truncated.ts.fixture",
    "corrupt.ts.fixture",
  ])("rejects unsupported, incomplete or disguised input %s", async (name) => {
    expect(await probeNonNativeVideo(context(fixture(name)))).toBe(0);
  });

  it("does not require audio capabilities for a video-only stream", async () => {
    vi.stubGlobal("AudioDecoder", undefined);
    vi.stubGlobal("AudioContext", undefined);
    expect(await probeNonNativeVideo(context(fixture("ts-avc-video-only.m2ts")))).toBe(3);
    expect(await probeNonNativeVideo(context(fixture("ts-avc-aac.ts.fixture")))).toBe(0);
  });

  it("recognizes the 204-byte transport packet layout without reading beyond the head budget", async () => {
    const source = new Uint8Array(readFileSync(join(process.cwd(), "examples", "ts-avc-aac.ts.fixture")));
    expect(source.byteLength % 188).toBe(0);
    const fec = new Uint8Array(source.byteLength / 188 * 204);
    for (let sourceOffset = 0, targetOffset = 0; sourceOffset < source.length; sourceOffset += 188, targetOffset += 204) {
      fec.set(source.subarray(sourceOffset, sourceOffset + 188), targetOffset);
    }
    expect(await probeNonNativeVideo(context(new File([fec], "capture.mts")))).toBe(3);
  });

  it("reads only the bounded head needed for transport tables and PES evidence", async () => {
    const source = fixture("ts-avc-aac.ts.fixture");
    const file = new File([source, new Uint8Array(PROBE_TOTAL_BYTES * 2)], "large.ts");
    let bytesRequested = 0;
    const originalSlice = file.slice.bind(file);
    vi.spyOn(file, "slice").mockImplementation((start, end, type) => {
      bytesRequested += Number(end ?? file.size) - Number(start ?? 0);
      return originalSlice(start, end, type);
    });

    expect(await probeNonNativeVideo(context(file))).toBe(3);
    expect(bytesRequested).toBeLessThanOrEqual(PROBE_TOTAL_BYTES);
  });
});

describe("non-native video QuickTime probe", () => {
  it.each(["mov-avc-pcm.mov", "mov-hevc-video-only.qt"])("accepts %s", async (name) => {
    expect(await probeNonNativeVideo(context(fixture(name)))).toBe(3);
  });

  it.each(["mov-unsupported-aac.mov", "disguised-matroska.mov", "corrupt.mov"])
    ("rejects unsupported or disguised input %s", async (name) => {
      expect(await probeNonNativeVideo(context(fixture(name)))).toBe(0);
    });

  it("does not require audio APIs for video-only MOV", async () => {
    vi.stubGlobal("AudioDecoder", undefined);
    vi.stubGlobal("AudioContext", undefined);
    expect(await probeNonNativeVideo(context(fixture("mov-hevc-video-only.qt")))).toBe(3);
    expect(await probeNonNativeVideo(context(fixture("mov-avc-pcm.mov")))).toBe(0);
  });
});

describe("non-native video Ogg Theora probe", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", class Worker {});
  });

  it.each(["ogv-theora-vorbis.ogv", "ogv-theora-opus.ogv", "ogv-theora-video-only.ogg"])("accepts %s", async (name) => {
    expect(await probeNonNativeVideo(context(fixture(name)))).toBe(3);
  });

  it.each(["ogv-vorbis-audio-only.ogg", "disguised-matroska.ogv", "corrupt.ogv"])
    ("rejects unsupported or disguised input %s", async (name) => {
      expect(await probeNonNativeVideo(context(fixture(name)))).toBe(0);
    });

  it("uses software video decoding but still requires Web Audio for an audio stream", async () => {
    vi.stubGlobal("VideoDecoder", undefined);
    vi.stubGlobal("AudioDecoder", undefined);
    expect(await probeNonNativeVideo(context(fixture("ogv-theora-video-only.ogg")))).toBe(3);
    vi.stubGlobal("AudioContext", undefined);
    expect(await probeNonNativeVideo(context(fixture("ogv-theora-vorbis.ogv")))).toBe(0);
  });
});
