import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DecodedFrame } from "@anyfile/ffmpeg-playback/client";
import { X4_INSV_PROJECTION } from "./projection";
import type { PanoramaRenderer } from "./panorama-renderer";
import type { Insta360ViewerElements } from "./ui";

const mocks = vi.hoisted(() => ({ next: vi.fn(), dispose: vi.fn(), closeFrame: vi.fn(), audio: vi.fn(), seek: vi.fn() }));
vi.mock("@anyfile/ffmpeg-playback/client", () => ({
  initializeFfmpeg: async () => ({
    openPanorama: async () => ({ duration: 2, width: 1920, height: 1920, videoCodec: "hevc", audioCodec: "aac", audio: true, sampleRate: 48000, channels: 2 }),
    next: mocks.next, seek: mocks.seek, dispose: mocks.dispose,
  }),
}));
import { FfmpegPanoramaPlayback } from "./ffmpeg-playback";

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  vi.stubGlobal("Worker", class {});
  vi.stubGlobal("AudioContext", mocks.audio);
  vi.stubGlobal("VideoFrame", class { close = mocks.closeFrame; });
});
afterEach(() => vi.unstubAllGlobals());
function elements(): Insta360ViewerElements {
  return { root: document.createElement("div"), viewport: document.createElement("div"), canvas: document.createElement("canvas"),
    reset: document.createElement("button"), play: document.createElement("button"), seek: document.createElement("input"),
    volume: document.createElement("input"), time: document.createElement("output"), status: document.createElement("span") };
}
function video(): DecodedFrame {
  return { kind: "video", lens: 0, timestamp: 0, duration: 1 / 30, width: 1920, height: 1920,
    data: new ArrayBuffer(1920 * 1920 * 1.5), sampleRate: 0, channels: 0, samples: 0 };
}
it("opens real paired outputs silently and releases temporary VideoFrames", async () => {
  const frames: DecodedFrame[] = [], frame = video();
  for (let i = 0; i < 4; i++) frames.push({ ...frame, timestamp: i / 30 }, { ...frame, lens: 1, timestamp: i / 30 }, {
    ...frame, kind: "audio", timestamp: i / 30, sampleRate: 48000, channels: 2, samples: 1600, data: new ArrayBuffer(12800),
  });
  mocks.next.mockImplementation(async () => frames.shift() ?? { kind: "eof" });
  const renderer = { setDualFrames: vi.fn() }, ui = elements();
  const session = await FfmpegPanoramaPlayback.open(new File([], "clip.insv"), renderer as unknown as PanoramaRenderer, X4_INSV_PROJECTION, ui, "en", new AbortController().signal);
  expect(renderer.setDualFrames).toHaveBeenCalledOnce(); expect(mocks.closeFrame).toHaveBeenCalledTimes(2);
  expect(mocks.audio).not.toHaveBeenCalled(); expect(ui.status.textContent).toContain("FFmpeg");
  await session.dispose(); await session.dispose(); expect(mocks.dispose).toHaveBeenCalledOnce();
});
it("ignores a first-frame result delivered after opening was aborted", async () => {
  let deliver!: (frame: DecodedFrame) => void;
  mocks.next.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
  const abort = new AbortController(), renderer = { setDualFrames: vi.fn() };
  const opening = FfmpegPanoramaPlayback.open(new File([], "clip.insv"), renderer as unknown as PanoramaRenderer, X4_INSV_PROJECTION, elements(), "en", abort.signal);
  const rejection = expect(opening).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.next).toHaveBeenCalledOnce());
  abort.abort(); deliver(video()); await rejection;
  expect(renderer.setDualFrames).not.toHaveBeenCalled(); expect(mocks.audio).not.toHaveBeenCalled();
});

function playbackHarness() {
  const started = vi.fn(), stopped = vi.fn();
  const context = { currentTime: 0, state: "running", destination: {}, resume: async () => {}, close: async () => {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBuffer: (_channels: number, count: number) => ({ getChannelData: () => new Float32Array(count) }),
    createBufferSource: () => ({ buffer: null, connect() {}, disconnect() {}, start: started, stop: stopped, onended: null }),
  };
  mocks.audio.mockImplementation(function () { return context; });
  let tick: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { tick = undefined; });
  return { context, started, stopped, tick: () => tick?.(0) };
}
function samples(count: number) {
  const frame = video(), frames: DecodedFrame[] = [];
  for (let i = 0; i < count; i++) frames.push({ ...frame, timestamp: i / 30 }, { ...frame, lens: 1, timestamp: i / 30 }, {
    ...frame, kind: "audio", timestamp: i / 30, sampleRate: 48000, channels: 2, samples: 1600, data: new ArrayBuffer(12800),
  });
  return frames;
}
it("waits for half a second on play and after starvation, with a short silent preview", async () => {
  const playback = playbackHarness(), frames = samples(60), ui = elements();
  let index = 0, gate = Infinity, unblock: (() => void) | undefined;
  mocks.seek.mockImplementation(async () => { index = 0; });
  mocks.next.mockImplementation(async () => {
    if (index >= gate) await new Promise<void>(resolve => { unblock = resolve; });
    return frames[index++] ?? { kind: "eof" };
  });
  const session = await FfmpegPanoramaPlayback.open(new File([], "clip.insv"), { setDualFrames() {} } as unknown as PanoramaRenderer,
    X4_INSV_PROJECTION, ui, "en", new AbortController().signal);
  expect(index).toBeLessThan(15); expect(playback.started).not.toHaveBeenCalled();
  gate = 30; ui.play!.click();
  await vi.waitFor(() => expect(index).toBe(30));
  expect(ui.status.textContent).toBe("Buffering panorama…"); expect(playback.started).not.toHaveBeenCalled();
  gate = 51; unblock!();
  await vi.waitFor(() => expect(index).toBe(51));
  expect(playback.started).toHaveBeenCalled(); expect(ui.status.textContent).toContain("FFmpeg");
  playback.context.currentTime = 1; playback.tick();
  expect(ui.status.textContent).toBe("Buffering panorama…"); expect(playback.stopped).toHaveBeenCalled();
  const previous = playback.started.mock.calls.length;
  gate = 60; unblock!();
  await vi.waitFor(() => expect(index).toBe(60));
  expect(playback.started).toHaveBeenCalledTimes(previous);
  gate = 102; unblock!();
  await vi.waitFor(() => expect(index).toBe(102));
  expect(playback.started.mock.calls.length).toBeGreaterThan(previous);
  expect(ui.status.textContent).toContain("FFmpeg");
  await session.dispose(); unblock!();
});
it("plays the EOF tail even when it is shorter than the buffer target", async () => {
  const playback = playbackHarness(), frames = samples(2), ui = elements();
  let index = 0;
  mocks.seek.mockImplementation(async () => { index = 0; });
  mocks.next.mockImplementation(async () => frames[index++] ?? { kind: "eof" });
  const session = await FfmpegPanoramaPlayback.open(new File([], "short.insv"), { setDualFrames() {} } as unknown as PanoramaRenderer,
    X4_INSV_PROJECTION, ui, "en", new AbortController().signal);
  ui.play!.click(); await vi.waitFor(() => expect(playback.started).toHaveBeenCalled());
  playback.context.currentTime = 1; playback.tick();
  expect(ui.play!.textContent).toBe("Replay"); await session.dispose();
});
