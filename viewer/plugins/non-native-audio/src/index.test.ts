import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

const media = vi.hoisted(() => ({
  codec: "opus", channels: 2, sampleRate: 48_000, duration: 3, videoTracks: 0, audioTracks: 1,
  inputDispose: vi.fn(), contextConstruct: vi.fn(), contextResume: vi.fn(), contextClose: vi.fn(), sourceStart: vi.fn(), sourceStop: vi.fn(),
}));

vi.mock("mediabunny", () => {
  const MATROSKA = {};
  const audioTrack = {
    getCodec: async () => media.codec,
    getNumberOfChannels: async () => media.channels,
    getSampleRate: async () => media.sampleRate,
    canDecode: async () => true,
    getFirstTimestamp: async () => 0,
  };
  const buffer = { length: 4800, numberOfChannels: 2 };
  return {
    MATROSKA,
    BlobSource: class BlobSource {},
    Input: class Input {
      canRead = async () => true; getFormat = async () => MATROSKA;
      getTracks = async () => Array.from({ length: media.audioTracks }, () => audioTrack);
      getVideoTracks = async () => Array.from({ length: media.videoTracks }, () => ({}));
      getAudioTracks = async () => Array.from({ length: media.audioTracks }, () => audioTrack);
      getDurationFromMetadata = async () => media.duration;
      dispose = media.inputDispose;
    },
    AudioBufferSink: class AudioBufferSink {
      async *buffers() { yield { buffer, timestamp: 0, duration: 0.1 }; }
    },
  };
});

import { nonNativeAudioViewer } from "./index";

const contexts: ViewerTestContext[] = [];
class MockAudioContext {
  state = "suspended"; currentTime = 0; destination = {};
  constructor() { media.contextConstruct(); }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, addEventListener() {}, start: media.sourceStart, stop: media.sourceStop }; }
  async resume() { this.state = "running"; media.contextResume(); }
  async close() { this.state = "closed"; media.contextClose(); }
}

function testContext() { const result = createViewerTestContext(new File(["audio"], "clip.mka")); contexts.push(result); return result; }

beforeEach(() => {
  media.codec = "opus"; media.channels = 2; media.sampleRate = 48_000; media.duration = 3; media.videoTracks = 0; media.audioTracks = 1;
  vi.stubGlobal("AudioDecoder", class AudioDecoder {}); vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1)); vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { for (const context of contexts.splice(0)) context.cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("non-native audio viewer lifecycle", () => {
  it("decodes the first buffer but creates Web Audio only after play", async () => {
    const context = testContext();
    const controller = await nonNativeAudioViewer.open(context.context);
    expect(context.container.textContent).toContain("Matroska · OPUS · 48000 Hz · 2 ch");
    // AudioVisualizer cycles its effect when the canvas is activated, so the canvas has to be a
    // named, focusable control instead of a decorative aria-hidden element.
    const visualizer = context.container.querySelector("canvas")!;
    expect(visualizer.getAttribute("role")).toBe("button");
    expect(visualizer.getAttribute("tabindex")).toBe("0");
    expect(visualizer.getAttribute("aria-label")).toBe("音频可视化效果，激活可在频谱与波形之间切换");
    expect(visualizer.getAttribute("aria-hidden")).toBeNull();
    expect(media.contextConstruct).not.toHaveBeenCalled();
    context.container.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() => expect(media.contextResume).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(media.sourceStart).toHaveBeenCalled());
    await controller.dispose(); await controller.dispose();
    expect(media.inputDispose).toHaveBeenCalledOnce();
    expect(media.contextClose).toHaveBeenCalledOnce();
  });

  it("stops active audio and removes DOM on abort", async () => {
    const context = testContext();
    const controller = await nonNativeAudioViewer.open(context.context);
    context.container.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() => expect(media.sourceStart).toHaveBeenCalled());
    context.abortController.abort();
    await vi.waitFor(() => expect(context.container.childElementCount).toBe(0));
    expect(media.sourceStop).toHaveBeenCalled();
    await controller.dispose();
  });

  it("rejects video, ambiguous audio tracks, and resource limits", async () => {
    media.videoTracks = 1;
    await expect(nonNativeAudioViewer.open(testContext().context)).rejects.toMatchObject({ code: "invalid-file" });
    media.videoTracks = 0; media.audioTracks = 2;
    await expect(nonNativeAudioViewer.open(testContext().context)).rejects.toMatchObject({ code: "invalid-file" });
    media.audioTracks = 1; media.channels = 8;
    await expect(nonNativeAudioViewer.open(testContext().context)).rejects.toMatchObject({ code: "resource-limit" });
  });
});
