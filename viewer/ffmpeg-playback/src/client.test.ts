import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FfmpegClient, initializeFfmpeg } from "./client";

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  reply(result: unknown, id = this.postMessage.mock.lastCall![0].id) { this.onmessage?.({ data: { id, result } }); }
  fail() { this.onmessage?.({ data: { id: this.postMessage.mock.lastCall![0].id, error: { code: "invalid-file" } } }); }
}
beforeEach(() => { vi.useFakeTimers(); TestWorker.instances = []; vi.stubGlobal("Worker", TestWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("FFmpeg Worker ownership", () => {
  it("serializes commands and ignores obsolete replies", async () => {
    const client = new FfmpegClient(new AbortController().signal), worker = TestWorker.instances[0];
    const pending = client.next();
    await expect(client.seek(2)).rejects.toThrow("Concurrent");
    worker.reply({ kind: "eof" }, 999);
    expect(vi.getTimerCount()).toBe(1);
    worker.reply({ kind: "eof" }); await expect(pending).resolves.toEqual({ kind: "eof" });
    client.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("hard abort rejects an in-flight decode and is idempotent", async () => {
    const abort = new AbortController(), client = new FfmpegClient(abort.signal), worker = TestWorker.instances[0];
    const pending = expect(client.next()).rejects.toMatchObject({ name: "AbortError" });
    abort.abort(); client.dispose(); await pending;
    expect(worker.terminate).toHaveBeenCalledTimes(1); expect(worker.onmessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("terminates a Worker stuck in synchronous WASM", async () => {
    const client = new FfmpegClient(new AbortController().signal);
    const pending = expect(client.next()).rejects.toMatchObject({ code: "resource-limit" });
    await vi.advanceTimersByTimeAsync(15000); await pending;
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it("falls back only during initialization, never after a file error", async () => {
    const initialized = initializeFfmpeg(new AbortController().signal);
    TestWorker.instances[0].fail(); await vi.advanceTimersByTimeAsync(0);
    expect(TestWorker.instances).toHaveLength(2);
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(TestWorker.instances[1].postMessage.mock.lastCall![0].assetBase).toContain("/vendor/ffmpeg-playback/");
    TestWorker.instances[1].reply({}); const client = await initialized;
    const opened = expect(client.open(new File(["bad"], "bad.avi"), true)).rejects.toMatchObject({ code: "invalid-file" });
    TestWorker.instances[1].fail(); await opened;
    expect(TestWorker.instances).toHaveLength(2); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not retry an aborted initialization", async () => {
    const abort = new AbortController();
    const pending = expect(initializeFfmpeg(abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    abort.abort(); await pending; expect(TestWorker.instances).toHaveLength(1);
  });
  it("does not create a Worker for an already aborted signal", () => {
    const abort = new AbortController(); abort.abort();
    expect(() => new FfmpegClient(abort.signal)).toThrow(); expect(TestWorker.instances).toHaveLength(0);
  });
});
