import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

const media = vi.hoisted(() => ({
  hasAudio: false,
  videoCodec: "avc",
  width: 160,
  height: 90,
  duration: 1.2,
  videoStart: 0,
  inputDispose: vi.fn(),
  contextClose: vi.fn(),
  contextResume: vi.fn(),
  sourceStart: vi.fn(),
  drawImage: vi.fn(),
  getCanvas: vi.fn(),
}));

vi.mock("mediabunny", () => {
  const MATROSKA = {};
  const audioTrack = {
    getCodec: async () => "aac",
    canDecode: async () => true,
    getFirstTimestamp: async () => 0,
  };
  const videoTrack = {
    getCodec: async () => media.videoCodec,
    getCodedWidth: async () => media.width,
    getCodedHeight: async () => media.height,
    canDecode: async () => true,
    getFirstTimestamp: async () => media.videoStart,
    getPrimaryPairableAudioTrack: async () => media.hasAudio ? audioTrack : null,
  };
  return {
    MATROSKA,
    BlobSource: class BlobSource {},
    Input: class Input {
      canRead = async () => true;
      getFormat = async () => MATROSKA;
      getTracks = async () => media.hasAudio ? [videoTrack, audioTrack] : [videoTrack];
      getPrimaryVideoTrack = async () => videoTrack;
      getAudioTracks = async () => media.hasAudio ? [audioTrack] : [];
      getDurationFromMetadata = async () => media.duration;
      getFirstTimestamp = async () => 0;
      dispose = media.inputDispose;
    },
    CanvasSink: class CanvasSink {
      getCanvas = media.getCanvas;
      async *canvases() {
        yield { canvas: document.createElement("canvas"), timestamp: 0, duration: 1 / 15 };
      }
    },
    AudioBufferSink: class AudioBufferSink {
      getBuffer = async () => ({ buffer: {}, timestamp: 0, duration: 0.1 });
      async *buffers() {
        yield { buffer: {}, timestamp: 0, duration: 0.1 };
      }
    },
  };
});

import { nonNativeVideoViewer } from "./index";

const contexts: ViewerTestContext[] = [];

class MockAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      disconnect() {},
      addEventListener() {},
      start: media.sourceStart,
      stop() {},
    };
  }
  async resume() {
    this.state = "running";
    media.contextResume();
  }
  async close() {
    this.state = "closed";
    media.contextClose();
  }
}

function testContext() {
  const result = createViewerTestContext(new File(["matroska"], "clip.mkv"));
  contexts.push(result);
  return result;
}

beforeEach(() => {
  media.hasAudio = false;
  media.videoCodec = "avc";
  media.width = 160;
  media.height = 90;
  media.duration = 1.2;
  media.videoStart = 0;
  media.getCanvas.mockImplementation(async (timestamp: number) => ({
    canvas: document.createElement("canvas"), timestamp, duration: 1 / 15,
  }));
  vi.stubGlobal("VideoDecoder", class VideoDecoder {});
  vi.stubGlobal("AudioDecoder", class AudioDecoder {});
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: media.drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("non-native video viewer protocol lifecycle", () => {
  it("decodes the first frame without autoplay and disposes idempotently", async () => {
    const context = testContext();
    const controller = await nonNativeVideoViewer.open(context.context);

    expect(context.container.querySelector("canvas")).not.toBeNull();
    expect(context.container.textContent).toContain("Matroska · AVC · video-only · 160 × 90");
    expect(context.container.querySelector("button")?.textContent).toBe("播放");
    expect(media.drawImage).toHaveBeenCalledOnce();
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(media.inputDispose).toHaveBeenCalledOnce();
  });

  it("resumes Web Audio only after the user presses play", async () => {
    media.hasAudio = true;
    const context = testContext();
    const controller = await nonNativeVideoViewer.open(context.context);

    expect(media.contextResume).not.toHaveBeenCalled();
    context.container.querySelector<HTMLButtonElement>("button")?.click();
    await vi.waitFor(() => expect(media.contextResume).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(media.sourceStart).toHaveBeenCalled());

    await controller.dispose();
    expect(media.contextClose).toHaveBeenCalledOnce();
  });

  it("resumes the latest seek when an end seek is immediately superseded", async () => {
    const context = testContext();
    const controller = await nonNativeVideoViewer.open(context.context);
    const playButton = context.container.querySelector<HTMLButtonElement>("button")!;
    const seek = context.container.querySelector<HTMLInputElement>('input[aria-label="播放位置"]')!;

    playButton.click();
    await vi.waitFor(() => expect(playButton.textContent).toBe("暂停"));
    seek.value = String(media.duration);
    seek.dispatchEvent(new Event("input"));
    seek.value = "0.6";
    seek.dispatchEvent(new Event("input"));

    await vi.waitFor(() => expect(playButton.textContent).toBe("暂停"));
    expect(media.getCanvas).toHaveBeenCalledWith(0.6);
    await controller.dispose();
  });

  it("stops and removes an active player on host abort", async () => {
    media.hasAudio = true;
    const context = testContext();
    const controller = await nonNativeVideoViewer.open(context.context);

    context.abortController.abort();
    await vi.waitFor(() => expect(context.container.childElementCount).toBe(0));
    expect(media.inputDispose).toHaveBeenCalledOnce();
    expect(media.contextClose).toHaveBeenCalledOnce();
    await controller.dispose();
  });

  it("rejects a codec outside the declared subset and cleans the input", async () => {
    media.videoCodec = "mpeg4";
    const context = testContext();
    await expect(nonNativeVideoViewer.open(context.context)).rejects.toMatchObject({
      code: "invalid-file",
    });
    expect(context.container.childElementCount).toBe(0);
    expect(media.inputDispose).toHaveBeenCalled();
  });

  it("returns resource-limit for unsafe coded dimensions", async () => {
    media.width = 9000;
    const context = testContext();
    await expect(nonNativeVideoViewer.open(context.context)).rejects.toMatchObject({
      code: "resource-limit",
    });
  });

  it("rejects an invalid primary timeline", async () => {
    media.videoStart = 2;
    const context = testContext();
    await expect(nonNativeVideoViewer.open(context.context)).rejects.toMatchObject({
      code: "invalid-file",
    });
  });

  it("requires Web Audio only when a primary audio track exists", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const videoOnly = testContext();
    const controller = await nonNativeVideoViewer.open(videoOnly.context);
    await controller.dispose();

    media.hasAudio = true;
    const withAudio = testContext();
    await expect(nonNativeVideoViewer.open(withAudio.context)).rejects.toMatchObject({
      code: "unsupported-environment",
    });
  });
});
