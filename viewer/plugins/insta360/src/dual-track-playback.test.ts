import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({
  inputDispose: vi.fn(),
  contextResume: vi.fn(),
  contextClose: vi.fn(),
  sourceStart: vi.fn(),
  getCanvas: vi.fn(),
  canDecode: vi.fn(async () => false),
}));

vi.mock("mediabunny", () => {
  const MP4 = {};
  const videoTracks = [0, 1].map((index) => ({
    index,
    getCodec: async () => "hevc",
    getCodedWidth: async () => 3840,
    getCodedHeight: async () => 3840,
    getFirstTimestamp: async () => 0,
    canDecode: media.canDecode,
  }));
  const audioTrack = {
    getCodec: async () => "aac",
    getFirstTimestamp: async () => 0,
    canDecode: media.canDecode,
  };
  return {
    MP4,
    BlobSource: class BlobSource {},
    Input: class Input {
      canRead = async () => true;
      getFormat = async () => MP4;
      getVideoTracks = async () => videoTracks;
      getAudioTracks = async () => [audioTrack];
      getDurationFromMetadata = async () => 4;
      dispose = media.inputDispose;
    },
    CanvasSink: class CanvasSink {
      readonly index: number;
      constructor(track: { index: number }) { this.index = track.index; }
      getCanvas = (timestamp: number) => media.getCanvas(this.index, timestamp);
      async *canvases(timestamp: number) {
        yield { canvas: document.createElement("canvas"), timestamp, duration: 1 / 25 };
      }
    },
    AudioBufferSink: class AudioBufferSink {
      getBuffer = async () => ({ buffer: {}, timestamp: 0, duration: 0.1 });
      async *buffers(timestamp: number) { yield { buffer: {}, timestamp, duration: 0.1 }; }
    },
  };
});

import { DualTrackPlayback } from "./dual-track-playback";
import { X5_VIDEO_PROJECTION } from "./projection";
import { insta360UiCopy, createInsta360ViewerElements } from "./ui";
import type { Insta360VideoInspection } from "./video-inspection";

class MockAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createBufferSource() {
    return { buffer: null, connect() {}, disconnect() {}, addEventListener() {}, start: media.sourceStart, stop() {} };
  }
  async resume() { this.state = "running"; media.contextResume(); }
  async close() { this.state = "closed"; media.contextClose(); }
}

const inspection = {
  kind: "video",
  device: "X5",
  width: 3840,
  height: 3840,
  layout: "dual-track",
  media: { container: "MP4", mimeType: "video/mp4", videoTracks: [], audioTracks: [], codecsSupported: false },
  moovOffset: 100,
} satisfies Insta360VideoInspection;

beforeEach(() => {
  media.getCanvas.mockImplementation(async (_index: number, timestamp: number) => ({
    canvas: document.createElement("canvas"), timestamp, duration: 1 / 25,
  }));
  vi.stubGlobal("VideoDecoder", class VideoDecoder {});
  vi.stubGlobal("AudioDecoder", class AudioDecoder {});
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("single-file dual-track playback", () => {
  it("attempts real first-frame decoding even when the advisory capability query would return false", async () => {
    const elements = createInsta360ViewerElements("modern.insv", inspection, "zh-CN");
    document.body.append(elements.root);
    const renderer = { setDualFrames: vi.fn() };
    const playback = await DualTrackPlayback.open(
      new File(["video"], "modern.insv"),
      inspection,
      X5_VIDEO_PROJECTION,
      renderer as never,
      elements,
      insta360UiCopy("zh-CN"),
      new AbortController().signal,
    );

    expect(renderer.setDualFrames).toHaveBeenCalledOnce();
    expect(media.canDecode).not.toHaveBeenCalled();
    expect(elements.root.querySelectorAll("video")).toHaveLength(0);
    expect(elements.time?.textContent).toBe("0:00 / 0:04");
    media.getCanvas.mockClear();
    elements.seek!.value = "2";
    elements.seek!.dispatchEvent(new Event("input"));
    await Promise.resolve();
    expect(media.getCanvas).not.toHaveBeenCalled();
    elements.seek!.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(media.getCanvas).toHaveBeenCalledWith(0, 2));
    expect(media.getCanvas).toHaveBeenCalledWith(1, 2);

    elements.play!.click();
    await vi.waitFor(() => expect(media.contextResume).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(media.sourceStart).toHaveBeenCalled());

    await playback.dispose();
    await playback.dispose();
    expect(media.inputDispose).toHaveBeenCalledOnce();
    expect(media.contextClose).toHaveBeenCalledOnce();
    elements.root.remove();
  });

  it("serializes committed seeks and skips stale dual-track results", async () => {
    const elements = createInsta360ViewerElements("modern.insv", inspection, "zh-CN");
    document.body.append(elements.root);
    const renderer = { setDualFrames: vi.fn() };
    const playback = await DualTrackPlayback.open(
      new File(["video"], "modern.insv"),
      inspection,
      X5_VIDEO_PROJECTION,
      renderer as never,
      elements,
      insta360UiCopy("zh-CN"),
      new AbortController().signal,
    );
    media.getCanvas.mockClear();
    renderer.setDualFrames.mockClear();
    const releases: Array<() => void> = [];
    media.getCanvas.mockImplementation((_index: number, timestamp: number) => new Promise((resolve) => {
      releases.push(() => resolve({ canvas: document.createElement("canvas"), timestamp, duration: 1 / 25 }));
    }));

    elements.seek!.value = "1";
    elements.seek!.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(media.getCanvas).toHaveBeenCalledTimes(2));
    elements.seek!.value = "3";
    elements.seek!.dispatchEvent(new Event("input"));
    elements.seek!.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(media.getCanvas).toHaveBeenCalledTimes(2);

    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(media.getCanvas).toHaveBeenCalledTimes(4));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(renderer.setDualFrames).toHaveBeenCalledOnce());
    await playback.dispose();
    elements.root.remove();
  });

  it("owns the abort signal after media inspection", async () => {
    const elements = createInsta360ViewerElements("modern.insv", inspection, "zh-CN");
    document.body.append(elements.root);
    const controller = new AbortController();
    await DualTrackPlayback.open(
      new File(["video"], "modern.insv"),
      inspection,
      X5_VIDEO_PROJECTION,
      { setDualFrames: vi.fn() } as never,
      elements,
      insta360UiCopy("zh-CN"),
      controller.signal,
    );

    controller.abort();
    await vi.waitFor(() => expect(media.contextClose).toHaveBeenCalledOnce());
    expect(media.inputDispose).toHaveBeenCalledOnce();
    elements.root.remove();
  });
});
