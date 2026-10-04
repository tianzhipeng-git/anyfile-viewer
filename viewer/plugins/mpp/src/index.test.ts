import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { mppViewer } from "./index";
import { mppManifest } from "./manifest";
import { probeMpp } from "./probe";
import { readBlob } from "./read";
import type { Request, Response } from "./types";

class TestWorker {
  static instances: TestWorker[] = [];
  static pause = false;
  onmessage: ((event: { data: Response }) => void) | null = null;
  onerror: (() => void) | null = null;
  pendingOpen = false;
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  postMessage(request: Request) {
    if (request.type === "open") this.pendingOpen = true;
    if (TestWorker.pause && request.type === "open") return;
    queueMicrotask(() => this.onmessage?.({ data: request.type === "init" ? { type: "ready" } : { type: "opened", document: { name: "Test plan", tasks: [], resources: [] } } }));
  }
}
const header = new Uint8Array(512);
header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const contexts: ReturnType<typeof createViewerTestContext>[] = [];
function context(file = new File([header], "plan.MPP")) {
  const test = createViewerTestContext(file); contexts.push(test); return test;
}
afterEach(() => { contexts.splice(0).forEach(test => test.cleanup()); vi.unstubAllGlobals(); TestWorker.instances = []; TestWorker.pause = false; });
describe("MPP plugin lifecycle", () => {
  it("validates the manifest and probes only the OLE header", async () => {
    expect(() => validateManifest(mppManifest)).not.toThrow();
    const test = context();
    expect(await probeMpp(test.context)).toBe(3);
    expect(await probeMpp(context(new File(["wrong"], "wrong.mpp")).context)).toBe(0);
    test.abortController.abort();
    await expect(probeMpp(test.context)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("reports real content, releases the parser and disposes only its own root", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const test = context(); const preview = vi.fn();
    const controller = await mppViewer.open({ ...test.context, reportPreview: preview });
    expect(test.container.textContent).toContain("Test plan");
    expect(preview).toHaveBeenCalledWith({ outcome: "success", kind: "structure" });
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
    test.abortController.abort(); await controller.dispose(); await controller.dispose();
    expect(test.container.children).toHaveLength(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });
  it("terminates pending parsing on cancellation without mounting stale content", async () => {
    vi.stubGlobal("Worker", TestWorker); TestWorker.pause = true;
    const test = context(); const opening = mppViewer.open(test.context);
    const rejected = expect(opening).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(TestWorker.instances[0]?.pendingOpen).toBe(true));
    test.abortController.abort(); await rejected;
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(test.container.children).toHaveLength(0);
  });
  it("rejects invalid and oversized input before constructing a runtime", async () => {
    vi.stubGlobal("Worker", TestWorker);
    await expect(mppViewer.open(context(new File(["invalid"], "bad.mpp")).context)).rejects.toMatchObject({ code: "invalid-file" });
    const file = new File([header], "large.mpp"); Object.defineProperty(file, "size", { value: 128 * 1024 * 1024 + 1 });
    await expect(mppViewer.open(context(file).context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(TestWorker.instances).toHaveLength(0);
  });
  it("aborts an in-progress file read promptly", async () => {
    const controller = new AbortController();
    const reading = readBlob(new Blob([header]), controller.signal);
    const rejected = expect(reading).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejected;
  });
});
