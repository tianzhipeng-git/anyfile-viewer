import { afterEach, expect, it, vi } from "vitest";
import { readScene } from "./scene-client";
class TestWorker {
  static current: TestWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { TestWorker.current = this; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("transfers input and terminates after a successful parse", async () => {
  vi.stubGlobal("Worker", TestWorker); const bytes = new ArrayBuffer(4);
  const pending = readScene(bytes, "fbx", new AbortController().signal); const worker = TestWorker.current;
  expect(worker.postMessage).toHaveBeenCalledWith({ bytes, format: "fbx" }, [bytes]);
  worker.onmessage!({ data: { result: { images: [] } } });
  await expect(pending).resolves.toEqual({ images: [] }); expect(worker.terminate).toHaveBeenCalledOnce();
});
it("terminates when cancelled and detaches callbacks", async () => {
  vi.stubGlobal("Worker", TestWorker); const controller = new AbortController();
  const pending = readScene(new ArrayBuffer(4), "dae", controller.signal); const worker = TestWorker.current;
  controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(worker.terminate).toHaveBeenCalledOnce(); expect(worker.onmessage).toBeNull();
});
it("limits stuck parser execution", async () => {
  vi.useFakeTimers(); vi.stubGlobal("Worker", TestWorker);
  const pending = expect(readScene(new ArrayBuffer(4), "fbx", new AbortController().signal)).rejects.toBeInstanceOf(RangeError);
  await vi.advanceTimersByTimeAsync(120000); await pending; expect(TestWorker.current.terminate).toHaveBeenCalledOnce();
});
it.each(["invalid-file", "resource-limit"])("propagates %s and cleans the worker", async error => {
  vi.stubGlobal("Worker", TestWorker);
  const pending = readScene(new ArrayBuffer(4), "fbx", new AbortController().signal);
  TestWorker.current.onmessage!({ data: { error } });
  await expect(pending).rejects.toBeInstanceOf(error === "resource-limit" ? RangeError : Error);
  expect(TestWorker.current.terminate).toHaveBeenCalledOnce();
});
