import { afterEach, expect, it, vi } from "vitest";
import { loadSkp } from "./skp-adapter";

vi.mock("./gltf", () => ({ loadGltf: vi.fn(async () => ({ root: {}, units: "m" })) }));
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { instances.push(this); }
}
function context(signal = new AbortController().signal) {
  vi.stubGlobal("Worker", FakeWorker);
  return { file: new File([], "model.skp"), container: document.createElement("div"), signal, locale: "en" as const, reportProgress: vi.fn() };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); instances.length = 0; });

it("terminates decoding on cancellation", async () => {
  const controller = new AbortController();
  const result = loadSkp(new ArrayBuffer(32), context(controller.signal));
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(instances[0].terminate).toHaveBeenCalledOnce();
});
it("does not create a worker for an already cancelled open", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(loadSkp(new ArrayBuffer(0), context(controller.signal))).rejects.toMatchObject({ name: "AbortError" });
  expect(instances).toHaveLength(0);
});
it("bounds decoding time and terminates a stuck parser", async () => {
  vi.useFakeTimers();
  const result = loadSkp(new ArrayBuffer(32), context());
  const assertion = expect(result).rejects.toBeInstanceOf(RangeError);
  await vi.advanceTimersByTimeAsync(60_000);
  await assertion;
  expect(instances[0].terminate).toHaveBeenCalledOnce();
});
it.each(["resource-limit", "invalid-file"])("cleans up on %s", async error => {
  const result = loadSkp(new ArrayBuffer(32), context());
  instances[0].onmessage!({ data: { error } });
  await expect(result).rejects.toBeInstanceOf(error === "resource-limit" ? RangeError : Error);
  expect(instances[0].terminate).toHaveBeenCalledOnce();
});
it("releases the worker after success and explains preview limitations", async () => {
  const result = loadSkp(new ArrayBuffer(32), context());
  instances[0].onmessage!({ data: { result: new ArrayBuffer(0) } });
  expect((await result).description).toContain("SketchUp geometry preview");
  expect(instances[0].terminate).toHaveBeenCalledOnce();
});
