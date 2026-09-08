import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { zipSync } from "fflate";

import { pixelmatorPxdViewer } from "./index";

const contexts: ViewerTestContext[] = [];
const canvasContext = {
  setTransform: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
};

function pxdFile(metadata = "SQLite format 3\0metadata") {
  const bytes = zipSync({
    "metadata.info": new TextEncoder().encode(metadata),
    "QuickLook/Thumbnail.webp": new Uint8Array([0x52, 0x49, 0x46, 0x46]),
  }, { level: 0 });
  return new File([bytes.buffer as ArrayBuffer], "design.pxd");
}

function context(file: File) {
  const result = createViewerTestContext(file);
  contexts.push(result);
  return result;
}

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 320, height: 180, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  for (const item of contexts.splice(0)) item.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Pixelmator PXD viewer protocol compliance", () => {
  it("extracts the flattened preview and cleans up idempotently", async () => {
    const test = context(pxdFile());
    const controller = await pixelmatorPxdViewer.open(test.context);

    expect(test.container.querySelector(".anyfile-pixelmator-pxd-viewer__canvas")).toBeInstanceOf(HTMLCanvasElement);
    expect(test.container.textContent).toContain("PXD · 扁平化 Quick Look 预览 · WEBP · 320 × 180");
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
  });

  it("rejects a ZIP with non-SQLite metadata", async () => {
    const test = context(pxdFile("not sqlite"));

    await expect(pixelmatorPxdViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(test.container.childElementCount).toBe(0);
  });

  it("disposes the active viewer when opening is aborted", async () => {
    const test = context(pxdFile());
    await pixelmatorPxdViewer.open(test.context);

    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
  });
});
