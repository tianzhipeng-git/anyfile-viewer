import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  inputDispose: vi.fn(),
  contextClose: vi.fn(),
}));

vi.mock("mediabunny", () => {
  const MP4 = {};
  const videoTracks = [0, 1].map((index) => ({
    index,
    getCodec: async () => "hevc",
    getCodedWidth: async () => 3840,
    getCodedHeight: async () => 3840,
    getFirstTimestamp: async () => 0,
  }));
  const audioTrack = { getCodec: async () => "aac", getFirstTimestamp: async () => 0 };
  return {
    MP4,
    BlobSource: class BlobSource {},
    Input: class Input {
      canRead = async () => true;
      getFormat = async () => MP4;
      getVideoTracks = async () => videoTracks;
      getAudioTracks = async () => [audioTrack];
      getDurationFromMetadata = async () => 240;
      dispose = media.inputDispose;
    },
    CanvasSink: class CanvasSink {
      readonly index: number;
      constructor(track: { index: number }) { this.index = track.index; }
      getCanvas = (timestamp: number) => media.getCanvas(this.index, timestamp);
      async *canvases() { /* Playback is not exercised here. */ }
    },
    AudioBufferSink: class AudioBufferSink {
      getBuffer = async () => ({ buffer: {}, timestamp: 0, duration: 0.1 });
      async *buffers() { /* Playback is not exercised here. */ }
    },
  };
});

import { DjiOsmoPlayback } from "./playback";
import { createDjiOsmoViewerElements, djiOsmoUiCopy } from "./ui";
import type { DjiOsmoVideoInspection } from "./video-inspection";

class MockAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  async close() { this.state = "closed"; media.contextClose(); }
}

const inspection = {
  kind: "video",
  device: "Osmo 360",
  width: 3840,
  height: 3840,
  media: { container: "MP4", mimeType: "video/mp4", videoTracks: [], audioTracks: [], codecsSupported: false },
} satisfies DjiOsmoVideoInspection;

beforeEach(() => {
  media.getCanvas.mockImplementation(async (_index: number, timestamp: number) => ({
    canvas: document.createElement("canvas"), timestamp, duration: 1 / 25,
  }));
  vi.stubGlobal("VideoDecoder", class VideoDecoder {});
  vi.stubGlobal("AudioDecoder", class AudioDecoder {});
  vi.stubGlobal("AudioContext", MockAudioContext);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DJI Osmo seek scheduling", () => {
  it("does not decode while dragging and never overlaps committed seeks", async () => {
    const elements = createDjiOsmoViewerElements("capture.osv", inspection, "zh-CN");
    document.body.append(elements.root);
    const renderer = { setFisheyeFrames: vi.fn() };
    const playback = await DjiOsmoPlayback.open(
      new File(["video"], "capture.osv"),
      inspection,
      renderer as never,
      elements,
      djiOsmoUiCopy("zh-CN"),
      new AbortController().signal,
    );
    media.getCanvas.mockClear();
    renderer.setFisheyeFrames.mockClear();

    for (const value of ["60", "120", "180"]) {
      elements.seek!.value = value;
      elements.seek!.dispatchEvent(new Event("input"));
    }
    await Promise.resolve();
    expect(media.getCanvas).not.toHaveBeenCalled();
    expect(elements.time?.textContent).toBe("3:00 / 4:00");

    const releases: Array<() => void> = [];
    media.getCanvas.mockImplementation((_index: number, timestamp: number) => new Promise((resolve) => {
      releases.push(() => resolve({ canvas: document.createElement("canvas"), timestamp, duration: 1 / 25 }));
    }));
    elements.seek!.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(media.getCanvas).toHaveBeenCalledTimes(2));

    elements.seek!.value = "200";
    elements.seek!.dispatchEvent(new Event("input"));
    elements.seek!.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(media.getCanvas).toHaveBeenCalledTimes(2);

    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(media.getCanvas).toHaveBeenCalledTimes(4));
    expect(media.getCanvas).toHaveBeenNthCalledWith(3, 0, 200);
    expect(media.getCanvas).toHaveBeenNthCalledWith(4, 1, 200);
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(renderer.setFisheyeFrames).toHaveBeenCalledOnce());

    await playback.dispose();
  });
});
