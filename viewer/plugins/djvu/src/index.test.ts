import { createViewerTestContext } from "@anyfile/viewer-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { djvuViewer } from "./index";
import { DJVU_LIMITS } from "./limits";
import type { DjvuOpenResult, DjvuWorkerRequest, DjvuWorkerResponse } from "./types";

function makeDjvuHeader(formType = "DJVM", flags = 0x81) {
  const bytes = new Uint8Array(32);
  bytes.set(new TextEncoder().encode("AT&TFORM"), 0);
  new DataView(bytes.buffer).setUint32(8, 20, false);
  bytes.set(new TextEncoder().encode(formType), 12);
  if (formType === "DJVM") {
    bytes.set(new TextEncoder().encode("DIRM"), 16);
    new DataView(bytes.buffer).setUint32(20, 4, false);
    bytes[24] = flags;
  }
  return bytes;
}

class MockDjvuWorker {
  static instances: MockDjvuWorker[] = [];
  static nextOpenResult: DjvuOpenResult = {
    docType: "bundled",
    pageCount: 2,
    pages: [
      { width: 1000, height: 1400, dpi: 300, rotation: 0 },
      { width: 1000, height: 1400, dpi: 300, rotation: 0 },
    ],
    outline: [{ title: "Chapter 2", page: 1, children: [] }],
  };
  static openError: { code: "invalid-file" | "missing-related-file" | "resource-limit"; message: string } | null = null;
  static renderedPages: number[] = [];

  private listeners = new Map<string, Set<(event: unknown) => void>>();
  terminated = false;

  addEventListener(type: string, fn: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  private emit(data: DjvuWorkerResponse) {
    if (this.terminated) return;
    queueMicrotask(() => {
      if (this.terminated) return;
      for (const fn of this.listeners.get("message") ?? []) {
        fn({ data });
      }
    });
  }

  postMessage(req: DjvuWorkerRequest) {
    if (req.type === "init") {
      this.emit({ type: "ready", id: req.id });
    } else if (req.type === "open") {
      if (MockDjvuWorker.openError) {
        this.emit({ type: "error", id: req.id, ...MockDjvuWorker.openError });
      } else {
        this.emit({ type: "opened", id: req.id, document: MockDjvuWorker.nextOpenResult });
      }
    } else if (req.type === "render") {
      MockDjvuWorker.renderedPages.push(req.pageIndex);
      const rgba = new Uint8Array(req.width * req.height * 4).fill(200);
      this.emit({ type: "rendered", id: req.id, width: req.width, height: req.height, rgba: rgba.buffer });
    } else if (req.type === "text") {
      this.emit({
        type: "text",
        id: req.id,
        pageText: { scale: 10000, words: [{ x: 1000, y: 1000, w: 800, h: 300, t: "DjVu" }] },
      });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockDjvuWorker.instances = [];
  MockDjvuWorker.openError = null;
  MockDjvuWorker.renderedPages = [];
  MockDjvuWorker.nextOpenResult = {
    docType: "bundled",
    pageCount: 2,
    pages: [
      { width: 1000, height: 1400, dpi: 300, rotation: 0 },
      { width: 1000, height: 1400, dpi: 300, rotation: 0 },
    ],
    outline: [{ title: "Chapter 2", page: 1, children: [] }],
  };
});

function installEnvironmentMocks() {
  vi.stubGlobal("Worker", class extends MockDjvuWorker {
    constructor() {
      super();
      MockDjvuWorker.instances.push(this);
    }
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("ImageData", class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    putImageData: () => {},
  }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
}

describe("djvuViewer", () => {
  it("opens a DjVu document, mounts outline, text layer, source link, and cleans up on dispose", async () => {
    installEnvironmentMocks();
    const { context, container } = createViewerTestContext(new File([makeDjvuHeader()], "sample.djvu"));

    const instance = await djvuViewer.open(context);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const root = container.querySelector(".anyfile-djvu-viewer");
    expect(root).not.toBeNull();
    expect(container.querySelectorAll(".anyfile-paged-viewer__page").length).toBe(2);
    expect(container.querySelector('a[href="/source/djvu.html"]')).not.toBeNull();
    expect(MockDjvuWorker.renderedPages).toContain(0);
    expect(container.querySelector(".anyfile-paged-viewer__text-word")?.textContent).toBe("DjVu ");

    // Click outline item to jump to page 2
    const outlineBtn = container.querySelector(".anyfile-paged-viewer__outline-btn") as HTMLButtonElement;
    outlineBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(MockDjvuWorker.renderedPages).toContain(1);

    instance.dispose();
    instance.dispose();
    expect(container.children.length).toBe(0);
    expect(MockDjvuWorker.instances.every((w) => w.terminated)).toBe(true);
  });

  it("evicts offscreen canvases when active rendered pages exceed budget", async () => {
    installEnvironmentMocks();
    const pages = Array.from({ length: 10 }, () => ({ width: 800, height: 1000, dpi: 300, rotation: 0 }));
    MockDjvuWorker.nextOpenResult = { docType: "bundled", pageCount: 10, pages, outline: [] };

    const { context, container } = createViewerTestContext(new File([makeDjvuHeader()], "many.djvu"));
    const instance = await djvuViewer.open(context);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const pageInput = container.querySelector(".anyfile-paged-viewer__page-input") as HTMLInputElement;
    for (let p = 2; p <= 8; p += 1) {
      pageInput.value = String(p);
      pageInput.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    const activeCanvases = Array.from(container.querySelectorAll(".anyfile-paged-viewer__page canvas"))
      .filter((c) => (c as HTMLCanvasElement).width > 0);
    expect(activeCanvases.length).toBeLessThanOrEqual(DJVU_LIMITS.maxActiveCanvasPages);

    instance.dispose();
  });

  it("rejects indirect, oversized, invalid, unsupported-environment, and aborted opens cleanly", async () => {
    installEnvironmentMocks();

    // Indirect DjVu -> missing-related-file
    const indirectCtx = createViewerTestContext(new File([makeDjvuHeader("DJVM", 0x01)], "indirect.djvu"));
    await expect(djvuViewer.open(indirectCtx.context)).rejects.toMatchObject({ code: "missing-related-file" });
    expect(indirectCtx.container.children.length).toBe(0);

    // Invalid file -> invalid-file
    const invalidCtx = createViewerTestContext(new File(["not djvu"], "bad.djvu"));
    await expect(djvuViewer.open(invalidCtx.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(invalidCtx.container.children.length).toBe(0);

    // Oversized file -> resource-limit
    const bigFile = new File([makeDjvuHeader()], "huge.djvu");
    Object.defineProperty(bigFile, "size", { value: DJVU_LIMITS.maxInputBytes + 1 });
    const bigCtx = createViewerTestContext(bigFile);
    await expect(djvuViewer.open(bigCtx.context)).rejects.toMatchObject({ code: "resource-limit" });

    // Pre-aborted signal -> AbortError
    const aborted = createViewerTestContext(new File([makeDjvuHeader()], "abort.djvu"));
    aborted.abortController.abort();
    await expect(djvuViewer.open(aborted.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(aborted.container.children.length).toBe(0);

    // Unsupported environment -> unsupported-environment
    vi.stubGlobal("Worker", undefined);
    const noEnv = createViewerTestContext(new File([makeDjvuHeader()], "noworker.djvu"));
    await expect(djvuViewer.open(noEnv.context)).rejects.toMatchObject({ code: "unsupported-environment" });
  });
});
