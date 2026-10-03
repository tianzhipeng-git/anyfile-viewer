import { afterEach, describe, expect, it, vi } from "vitest";
import { DicomWorker } from "./worker-client";

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.last = this; }
}
afterEach(() => vi.unstubAllGlobals());
describe("DICOM worker ownership", () => {
  it("terminates and rejects pending reads on abort, with idempotent disposal", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const abort = new AbortController();
    const client = new DicomWorker(abort.signal);
    const pending = client.open(new File([], "test.dcm"));
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    client.dispose(); client.dispose();
    expect(FakeWorker.last.terminate).toHaveBeenCalledTimes(1);
    expect(FakeWorker.last.onmessage).toBeNull();
    await expect(client.frame(0)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects pending work and releases the worker on a worker crash", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new DicomWorker(new AbortController().signal);
    const pending = client.open(new File([], "test.dcm"));
    FakeWorker.last.onerror!();
    await expect(pending).rejects.toMatchObject({ code: "open-failed" });
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it("does not construct a worker for an already canceled instance", () => {
    const worker = vi.fn(); vi.stubGlobal("Worker", worker);
    const abort = new AbortController(); abort.abort();
    expect(() => new DicomWorker(abort.signal)).toThrow();
    expect(worker).not.toHaveBeenCalled();
  });
});
