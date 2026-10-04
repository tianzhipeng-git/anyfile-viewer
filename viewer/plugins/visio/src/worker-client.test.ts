import { afterEach, expect, it, vi } from "vitest";
import { VisioWorkerClient } from "./worker-client";
import { messages } from "./messages";
class WorkerStub {
  static instance: WorkerStub;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { WorkerStub.instance = this; }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("terminates an over-budget parse and releases its pending request", async () => {
  vi.useFakeTimers(); vi.stubGlobal("Worker", WorkerStub);
  const client = new VisioWorkerClient(new AbortController().signal, messages("en"));
  const result = expect(client.open(new ArrayBuffer(8))).rejects.toMatchObject({ code: "resource-limit" });
  await vi.advanceTimersByTimeAsync(30_000); await result;
  expect(WorkerStub.instance.terminate).toHaveBeenCalledTimes(1);
  expect(WorkerStub.instance.onmessage).toBeNull();
  client.dispose(); expect(WorkerStub.instance.terminate).toHaveBeenCalledTimes(1);
});
