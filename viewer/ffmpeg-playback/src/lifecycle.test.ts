import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OpenViewerContext } from "@anyfile/viewer-protocol";
import { openFfmpeg } from "./index";
const mocks = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("./client", () => ({ initializeFfmpeg: mocks.initialize, FFMPEG_LOCAL: "/vendor/ffmpeg-playback/test/" }));
const info = { video: false, audio: true, audioCodec: "pcm_s16be", sampleRate: 48000, channels: 1, duration: 4, width: 0, height: 0, videoCodec: "" };
const frame = () => ({ kind: "audio", timestamp: 0, duration: 0.02, data: new Float32Array(960).buffer, samples: 960, channels: 1, sampleRate: 48000 });
function context(abort = new AbortController()) {
  const container = document.createElement("div"); document.body.append(container);
  return { container, signal: abort.signal, file: new File(["fixture"], "test.aiff"), locale: "en", reportProgress: vi.fn() } as unknown as OpenViewerContext;
}
beforeEach(() => { vi.stubGlobal("Worker", class {}); vi.stubGlobal("AudioContext", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); document.body.replaceChildren(); });
it("accepts valid silent PCM without creating audio; active abort removes DOM and disposal is repeatable", async () => {
  const client = { open: vi.fn().mockResolvedValue(info), next: vi.fn().mockResolvedValue(frame()), dispose: vi.fn() };
  mocks.initialize.mockResolvedValue(client);
  const abort = new AbortController(), input = context(abort);
  const opened = await openFfmpeg(input, false, () => true);
  expect(input.container.querySelector("button")?.textContent).toBe("Play");
  expect(AudioContext).not.toHaveBeenCalled();
  abort.abort(); await opened.dispose(); await opened.dispose();
  expect(input.container.childElementCount).toBe(0); expect(client.dispose).toHaveBeenCalled();
});
it("opening abort rejects a pending first PCM and cannot append late UI", async () => {
  let rejectDecode: (error: unknown) => void = () => {};
  const client = { open: vi.fn().mockResolvedValue(info), next: vi.fn(() => new Promise((_, reject) => { rejectDecode = reject; })), dispose: vi.fn(() => rejectDecode(new DOMException("Aborted", "AbortError"))) };
  mocks.initialize.mockResolvedValue(client);
  const abort = new AbortController(), input = context(abort);
  const opened = openFfmpeg(input, false, () => true);
  await vi.waitFor(() => expect(client.next).toHaveBeenCalled());
  abort.abort(); await expect(opened).rejects.toMatchObject({ name: "AbortError" });
  expect(input.container.childElementCount).toBe(0); expect(AudioContext).not.toHaveBeenCalled();
});
it("independently rejects mismatched metadata before creating playback UI", async () => {
  const client = { open: vi.fn().mockResolvedValue(info), next: vi.fn(), dispose: vi.fn() };
  mocks.initialize.mockResolvedValue(client); const input = context();
  await expect(openFfmpeg(input, false, () => false)).rejects.toMatchObject({ code: "invalid-file" });
  expect(client.next).not.toHaveBeenCalled(); expect(client.dispose).toHaveBeenCalled(); expect(input.container.childElementCount).toBe(0);
});
it("active decode failure closes audio while retaining a stable error, then dispose removes it", async () => {
  const close = vi.fn().mockResolvedValue(undefined), stop = vi.fn(), disconnect = vi.fn();
  vi.stubGlobal("AudioContext", class {
    state = "running"; currentTime = 0; destination = {};
    resume = vi.fn().mockResolvedValue(undefined); close = close;
    createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect }; }
    createBuffer(channels: number, length: number) { return { length, numberOfChannels: channels, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return { connect: vi.fn(), start: vi.fn(), stop, disconnect, buffer: null, onended: null }; }
  });
  const client = { open: vi.fn().mockResolvedValue(info), seek: vi.fn().mockResolvedValue(undefined), next: vi.fn().mockResolvedValueOnce(frame()).mockResolvedValueOnce(frame()).mockRejectedValue(new Error("broken packet")), dispose: vi.fn() };
  mocks.initialize.mockResolvedValue(client); const input = context();
  const opened = await openFfmpeg(input, false, () => true);
  input.container.querySelector("button")!.click();
  await vi.waitFor(() => expect(input.container.querySelector('[role="alert"]')?.textContent).toBe("Unable to play this file."));
  expect(close).toHaveBeenCalled(); expect(stop).toHaveBeenCalled(); expect(client.dispose).toHaveBeenCalled();
  await opened.dispose(); expect(input.container.childElementCount).toBe(0);
});
