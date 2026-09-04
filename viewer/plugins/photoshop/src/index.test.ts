import { createViewerTestContext } from "@anyfile/viewer-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { photoshopViewer } from "./index";
import type { PhotoshopWorkerRequest, PhotoshopWorkerResponse } from "./types";

function psdFile() {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set([0x38, 0x42, 0x50, 0x53]);
  view.setUint16(4, 1);
  view.setUint16(12, 4);
  view.setUint32(14, 1);
  view.setUint32(18, 2);
  view.setUint16(22, 8);
  view.setUint16(24, 3);
  return new File([bytes], "artwork.psd");
}

class MockWorker extends EventTarget {
  static pending = false;
  static instances: MockWorker[] = [];
  terminated = false;

  constructor() {
    super();
    MockWorker.instances.push(this);
  }

  postMessage(request: PhotoshopWorkerRequest) {
    if (MockWorker.pending) return;
    queueMicrotask(() => {
      if (this.terminated) return;
      const response: PhotoshopWorkerResponse = {
        type: "decoded",
        id: request.id,
        info: { width: 2, height: 1, depth: 8, colorMode: "RGB", layerCount: 2, visibleLayerCount: 1 },
        rgba: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
      };
      this.dispatchEvent(new MessageEvent("message", { data: response }));
    });
  }

  terminate() { this.terminated = true; }
}

const canvasContext = {
  setTransform: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
};

beforeEach(() => {
  MockWorker.pending = false;
  MockWorker.instances = [];
  vi.stubGlobal("Worker", MockWorker);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 1, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Photoshop viewer protocol compliance", () => {
  it("renders the composite and disposes owned resources idempotently", async () => {
    const test = createViewerTestContext(psdFile());
    const controller = await photoshopViewer.open(test.context);

    expect(test.container.querySelector(".anyfile-photoshop-viewer__canvas")).toBeInstanceOf(HTMLCanvasElement);
    expect(test.container.textContent).toContain("2 图层");
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });

  it("cancels an unfinished Worker decode without leaving DOM", async () => {
    MockWorker.pending = true;
    const test = createViewerTestContext(psdFile());
    const opening = photoshopViewer.open(test.context);
    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    test.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });
});
