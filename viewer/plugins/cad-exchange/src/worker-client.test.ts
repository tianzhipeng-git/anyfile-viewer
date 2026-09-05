import { afterEach, expect, it, vi } from "vitest";
import { createCadWorkerClient } from "./worker-client";

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  reply(data: unknown) { this.onmessage!({ data }); }
}
const copy = { invalid: "Invalid CAD", limit: "CAD limit", unsupported: "No CAD runtime" };
function start() {
  vi.stubGlobal("Worker", TestWorker);
  const controller = new AbortController();
  return { controller, opening: createCadWorkerClient(controller.signal, copy) };
}
async function worker(index = 0) {
  await vi.waitFor(() => expect(TestWorker.instances[index]?.postMessage).toHaveBeenCalled());
  return TestWorker.instances[index];
}
afterEach(() => { TestWorker.instances = []; vi.unstubAllGlobals(); vi.useRealTimers(); });

it("uses R2 first and transfers input only after initialization", async () => {
  const { opening } = start();
  const first = await worker();
  expect(first.postMessage.mock.calls[0][0]).toEqual({ type: "init", runtimeUrl: "https://assets.anyfile.top/vendor/occt-import-js/0.0.23-anyfile.1/occt-import-js.js" });
  first.reply({ type: "ready" });
  const client = await opening;
  const bytes = new ArrayBuffer(4);
  const result = client.open(bytes, "step");
  expect(first.postMessage).toHaveBeenLastCalledWith({ type: "open", bytes, format: "step" }, [bytes]);
  first.reply({ type: "opened", result: { meshes: [] } });
  await expect(result).resolves.toEqual({ meshes: [] });
  client.dispose(); client.dispose();
  expect(first.terminate).toHaveBeenCalledOnce();
});

it.each(["initialization", "worker"])("disposes failed R2 %s before trying same-origin", async (failure) => {
  const { opening } = start();
  const first = await worker();
  if (failure === "worker") first.onerror!();
  else first.reply({ type: "error", code: "unsupported-environment" });
  const second = await worker(1);
  expect(first.terminate).toHaveBeenCalledOnce();
  expect(second.postMessage.mock.calls[0][0]).toEqual({ type: "init", runtimeUrl: `${location.origin}/vendor/occt-import-js/0.0.23-anyfile.1/occt-import-js.js` });
  second.reply({ type: "ready" });
  (await opening).dispose();
  expect(second.terminate).toHaveBeenCalledOnce();
});

it("reports failure only after both sources fail and cleans both workers", async () => {
  const { opening } = start();
  const rejected = expect(opening).rejects.toMatchObject({ code: "unsupported-environment", message: copy.unsupported });
  (await worker()).reply({ type: "error", code: "unsupported-environment" });
  (await worker(1)).reply({ type: "error", code: "unsupported-environment" });
  await rejected;
  expect(TestWorker.instances).toHaveLength(2);
  for (const instance of TestWorker.instances) expect(instance.terminate).toHaveBeenCalledOnce();
});

it.each(["invalid-file", "resource-limit"])("does not switch sources on %s while parsing", async (code) => {
  const { opening } = start();
  const first = await worker(); first.reply({ type: "ready" });
  const client = await opening;
  const result = client.open(new ArrayBuffer(1), "step");
  first.reply({ type: "error", code });
  await expect(result).rejects.toMatchObject({ code });
  expect(TestWorker.instances).toHaveLength(1);
  client.dispose();
});

it.each(["initialization", "parsing"])("aborts during %s without retrying", async (phase) => {
  const { controller, opening } = start();
  const first = await worker();
  let pending: Promise<unknown> = opening;
  if (phase === "parsing") {
    first.reply({ type: "ready" });
    const client = await opening;
    pending = client.open(new ArrayBuffer(1), "step");
  }
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await rejected;
  expect(TestWorker.instances).toHaveLength(1);
  expect(first.terminate).toHaveBeenCalledOnce();
});

it("times out a stalled initialization and releases it before fallback", async () => {
  vi.useFakeTimers();
  const { opening } = start();
  await vi.advanceTimersByTimeAsync(0);
  const first = TestWorker.instances[0];
  await vi.advanceTimersByTimeAsync(20_000);
  expect(first.terminate).toHaveBeenCalledOnce();
  expect(TestWorker.instances).toHaveLength(2);
  TestWorker.instances[1].reply({ type: "ready" });
  (await opening).dispose();
  expect(vi.getTimerCount()).toBe(0);
});
