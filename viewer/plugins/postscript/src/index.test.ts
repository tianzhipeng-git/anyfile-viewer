import { createViewerTestContext } from "@anyfile/viewer-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postscriptViewer } from "./index";
import { STET_ASSET_SOURCES } from "./runtime";
import type { PostscriptWorkerRequest, PostscriptWorkerResponse } from "./types";

class MockWorker extends EventTarget {
  static pending = false;
  static streaming = false;
  static initializationFailures = 0;
  static instances: MockWorker[] = [];
  terminated = false;
  requests: PostscriptWorkerRequest[] = [];

  constructor() {
    super();
    MockWorker.instances.push(this);
  }

  postMessage(request: PostscriptWorkerRequest) {
    this.requests.push(request);
    if (MockWorker.pending) return;
    queueMicrotask(() => {
      if (this.terminated) return;
      let response: PostscriptWorkerResponse;
      if (request.type === "init" && MockWorker.initializationFailures-- > 0) {
        response = { type: "error", id: request.id, code: "open-failed", message: "Runtime unavailable" };
      } else if (request.type === "init") response = { type: "ready", id: request.id };
      else if (request.type === "open") response = { type: "opened", id: request.id, pages: [{ width: 120, height: 80, dpi: 150 }], streaming: MockWorker.streaming };
      else if (request.type === "step") response = { type: "stepped", id: request.id, pages: [{ width: 120, height: 80, dpi: 150 }], done: true };
      else response = { type: "rendered", id: request.id, width: 2, height: 1, rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]).buffer };
      this.dispatchEvent(new MessageEvent("message", { data: response }));
    });
  }

  terminate() {
    this.terminated = true;
  }
}

const canvasContext = { putImageData: vi.fn() };

beforeEach(() => {
  MockWorker.pending = false;
  MockWorker.streaming = false;
  MockWorker.initializationFailures = 0;
  MockWorker.instances = [];
  canvasContext.putImageData.mockClear();
  vi.stubGlobal("Worker", MockWorker);
  vi.stubGlobal("ImageData", class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("postscript viewer protocol compliance", () => {
  it("renders an EPS page and disposes its Worker and DOM idempotently", async () => {
    const file = new File(["%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 120 80\nshowpage\n"], "sample.eps");
    const test = createViewerTestContext(file);
    const controller = await postscriptViewer.open(test.context);

    expect(test.container.querySelector(".anyfile-postscript-viewer__canvas")).toBeInstanceOf(HTMLCanvasElement);
    expect(canvasContext.putImageData).toHaveBeenCalledOnce();
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });

  it("cancels an unfinished Worker initialization without leaving DOM", async () => {
    MockWorker.pending = true;
    const file = new File(["%!PS-Adobe-3.0\nshowpage\n"], "sample.ps");
    const test = createViewerTestContext(file);
    const opening = postscriptViewer.open(test.context);
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    test.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });

  it("falls back from jsDelivr to R2 and then local assets with a fresh Worker", async () => {
    MockWorker.initializationFailures = 2;
    const file = new File(["%!PS-Adobe-3.0\nshowpage\n"], "sample.ps");
    const test = createViewerTestContext(file);
    const controller = await postscriptViewer.open(test.context);

    expect(MockWorker.instances).toHaveLength(3);
    expect(MockWorker.instances.slice(0, 2).every((worker) => worker.terminated)).toBe(true);
    expect(MockWorker.instances.map((worker) => {
      const request = worker.requests[0];
      return request.type === "init" ? request.runtimeUrl : undefined;
    })).toEqual(STET_ASSET_SOURCES.map((source) => source.runtimeUrl));

    await controller.dispose();
    expect(MockWorker.instances[2].terminated).toBe(true);
    test.cleanup();
  });

  it("fails after trying each runtime source exactly once", async () => {
    MockWorker.initializationFailures = STET_ASSET_SOURCES.length;
    const file = new File(["%!PS-Adobe-3.0\nshowpage\n"], "sample.ps");
    const test = createViewerTestContext(file);

    await expect(postscriptViewer.open(test.context)).rejects.toMatchObject({ code: "open-failed" });
    expect(MockWorker.instances).toHaveLength(STET_ASSET_SOURCES.length);
    expect(MockWorker.instances.every((worker) => worker.terminated)).toBe(true);
    test.cleanup();
  });

  it("interprets the next streaming PostScript page only when requested", async () => {
    MockWorker.streaming = true;
    const file = new File(["%!PS-Adobe-3.0\nshowpage\nshowpage\n"], "sample.ps");
    const test = createViewerTestContext(file);
    const controller = await postscriptViewer.open(test.context);
    const next = test.container.querySelectorAll<HTMLButtonElement>("button")[1];

    expect(next?.disabled).toBe(false);
    next?.click();
    await vi.waitFor(() => expect(test.container.textContent).toMatch(/(?:Page|第) 2 \/ 2/));
    expect(canvasContext.putImageData).toHaveBeenCalledTimes(2);
    expect(next?.disabled).toBe(true);

    await controller.dispose();
    test.cleanup();
  });

  it("rejects invalid content before creating a Worker", async () => {
    const test = createViewerTestContext(new File(["not postscript"], "fake.eps"));
    await expect(postscriptViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(MockWorker.instances).toHaveLength(0);
    test.cleanup();
  });
});
