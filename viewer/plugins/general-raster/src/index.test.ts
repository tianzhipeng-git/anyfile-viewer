import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";

import { generalRasterViewer } from "./index";
import type { DecodedRaster, WorkerRequest, WorkerResponse } from "./types";

const raster: DecodedRaster = {
  width: 2,
  height: 1,
  rgba: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
  format: "TGA",
  bitDepth: 24,
  hasAlpha: false,
  colorSpace: "unknown",
  orientation: 1,
  orientationApplied: true,
  icc: "none",
  pageIndex: 0,
  pageCount: 1,
  tiled: false,
  compression: "none",
};

class MockWorker extends EventTarget {
  static pending = false;
  static instances: MockWorker[] = [];
  terminated = false;

  constructor() {
    super();
    MockWorker.instances.push(this);
  }

  postMessage(request: WorkerRequest) {
    if (MockWorker.pending) return;
    queueMicrotask(() => {
      if (this.terminated) return;
      const response: WorkerResponse = { type: "result", id: request.id, raster: { ...raster, rgba: raster.rgba.slice() } };
      this.dispatchEvent(new MessageEvent("message", { data: response }));
    });
  }

  terminate() {
    this.terminated = true;
  }
}

const canvasContext = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  drawImage: vi.fn(),
};

beforeEach(() => {
  MockWorker.pending = false;
  MockWorker.instances = [];
  vi.stubGlobal("Worker", MockWorker);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("general raster viewer protocol compliance", () => {
  it("renders through the worker and disposes its owned resources idempotently", async () => {
    const test = createViewerTestContext(new File(["bytes"], "sample.tga"));
    const controller = await generalRasterViewer.open(test.context);

    expect(test.container.querySelector(".anyfile-general-raster-viewer__canvas")).toBeInstanceOf(HTMLCanvasElement);
    expect(test.container.textContent).toContain("TGA");
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });

  it("cancels an unfinished opening decode without leaving DOM", async () => {
    MockWorker.pending = true;
    const test = createViewerTestContext(new File(["bytes"], "sample.tga"));
    const opening = generalRasterViewer.open(test.context);
    test.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });

  it("cleans an active viewer when the host aborts", async () => {
    const test = createViewerTestContext(new File(["bytes"], "sample.tga"));
    await generalRasterViewer.open(test.context);
    test.abortController.abort();

    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });
});
