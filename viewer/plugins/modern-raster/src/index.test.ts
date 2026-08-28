import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modernRasterViewer } from "./index";
import { MAX_HEIF_SOURCE_BYTES, MAX_MODERN_RASTER_SOURCE_BYTES } from "./limits";
import type { HeifWorkerRequest, HeifWorkerResponse } from "./types";

class MockWorker extends EventTarget {
  static pending = false;
  static instances: MockWorker[] = [];
  terminated = false;

  constructor() {
    super();
    MockWorker.instances.push(this);
  }

  postMessage(request: HeifWorkerRequest) {
    if (MockWorker.pending) return;
    queueMicrotask(() => {
      if (this.terminated) return;
      const response: HeifWorkerResponse = {
        type: "decoded", id: request.id, width: 2, height: 1,
        rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]).buffer,
        alpha: false, color: "sRGB", iccApplied: false, hdrToSdr: false,
      };
      this.dispatchEvent(new MessageEvent("message", { data: response }));
    });
  }

  terminate() { this.terminated = true; }
}

const canvasContext = {
  setTransform: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
};

async function heicFile() {
  return new File([await readFile(join(process.cwd(), "examples", "sample.heic"))], "sample.heic");
}

beforeEach(() => {
  MockWorker.pending = false;
  MockWorker.instances = [];
  vi.stubGlobal("ImageDecoder", undefined);
  vi.stubGlobal("Worker", MockWorker);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 1, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("modern raster open", () => {
  it("rejects oversized files before reading or starting a decoder", async () => {
    const file = { size: MAX_MODERN_RASTER_SOURCE_BYTES + 1 } as File;
    const reportProgress = vi.fn();
    const open = modernRasterViewer.open({ file, container: document.createElement("div"), signal: new AbortController().signal, locale: "zh-CN", reportProgress });
    await expect(open).rejects.toMatchObject({ code: "resource-limit" });
    expect(reportProgress).not.toHaveBeenCalled();
  });

  it("renders HEIC through the fallback worker and disposes idempotently", async () => {
    const test = createViewerTestContext(await heicFile());
    const controller = await modernRasterViewer.open(test.context);
    expect(test.container.textContent).toContain("WASM 回退");
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });

  it("does not apply the WASM input limit to native HEIC decoding", async () => {
    const source = await heicFile();
    const largeNativeFile = new Proxy(source, {
      get(target, property) {
        if (property === "size") return MAX_HEIF_SOURCE_BYTES + 1;
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    class MockImageDecoder {
      static isTypeSupported = vi.fn(async () => true);
      tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: 1, repetitionCount: 0 } };
      decode = vi.fn(async () => ({ image: { duration: 100_000, close: vi.fn() } }));
      close = vi.fn();
    }
    vi.stubGlobal("ImageDecoder", MockImageDecoder);
    const test = createViewerTestContext(largeNativeFile);
    await modernRasterViewer.open(test.context);
    expect(test.container.textContent).toContain("原生解码");
    expect(MockWorker.instances).toHaveLength(0);
    test.cleanup();
  });

  it("terminates an unfinished fallback on opening abort", async () => {
    MockWorker.pending = true;
    const test = createViewerTestContext(await heicFile());
    const opening = modernRasterViewer.open(test.context);
    await vi.waitFor(() => expect(MockWorker.instances.length).toBe(1));
    test.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });

  it("cleans the active fallback when the host aborts", async () => {
    const test = createViewerTestContext(await heicFile());
    await modernRasterViewer.open(test.context);
    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    test.cleanup();
  });
});
