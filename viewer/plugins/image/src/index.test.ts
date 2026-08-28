import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import {
  createDeferredFile,
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

import { browserImageViewer } from "./index";
import { browserImageManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];

function fixture(name: string) {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
  return new File([bytes], name);
}

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-viewer");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(96);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(64);
});

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("browser image viewer protocol compliance", () => {
  it("publishes the stage 1 formats in a valid manifest", () => {
    expect(() => validateManifest(browserImageManifest)).not.toThrow();
    expect(browserImageManifest.formats.flatMap(({ extensions }) => extensions)).toEqual([
      ".jpg", ".jpeg", ".jpe", ".jfif", ".jif", ".jfi", ".pjpeg", ".pjp",
      ".png", ".apng", ".gif", ".webp", ".avif", ".heif", ".heifs", ".hif",
      ".bmp", ".dib", ".ico", ".cur",
    ]);
  });

  it("renders a real animated fixture and releases resources on repeated dispose", async () => {
    const file = fixture("animated.gif");
    const directRead = vi.spyOn(file, "arrayBuffer");
    const context = testContext(file);

    const controller = await browserImageViewer.open(context.context);

    const image = context.container.querySelector<HTMLImageElement>(".anyfile-image-viewer__image");
    expect(image?.src).toBe("blob:image-viewer");
    expect(context.container.textContent).toContain("GIF · 96 × 64 · 2 帧");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(directRead).not.toHaveBeenCalled();

    const beforeZoom = image?.style.transform;
    context.container.querySelector<HTMLButtonElement>('[aria-label="放大"]')?.click();
    expect(image?.style.transform).not.toBe(beforeZoom);
    context.container.querySelector<HTMLButtonElement>('[aria-label="向右旋转"]')?.click();
    expect(image?.style.transform).toContain("rotate(90deg)");

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("rejects a corrupt file and cleans partial state", async () => {
    const context = testContext(fixture("corrupt.png"));

    await expect(browserImageViewer.open(context.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(context.container.childElementCount).toBe(0);
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("does not reject a browser-decodable file because of an application size cap", async () => {
    const file = fixture("sample.png");
    Object.defineProperty(file, "size", { value: 256 * 1024 * 1024 });
    const slice = vi.spyOn(file, "slice");
    const context = testContext(file);

    const controller = await browserImageViewer.open(context.context);
    expect(slice).toHaveBeenCalledWith(0, 1024 * 1024);
    expect(context.progress.at(-2)).toMatchObject({
      stage: "rendering",
      loaded: 1024 * 1024,
      total: 256 * 1024 * 1024,
    });
    await controller.dispose();
  });

  it("honors cancellation during opening", async () => {
    const deferred = createDeferredFile("delayed.gif", 1_024);
    const context = testContext(deferred.file);
    const opening = browserImageViewer.open(context.context);

    context.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });

  it("disposes the active viewer on abort and localizes errors", async () => {
    const context = testContext(fixture("sample.jpg"));
    const controller = await browserImageViewer.open(context.context);

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();

    const invalidContext = testContext(fixture("corrupt.png"));
    await expect(browserImageViewer.open({ ...invalidContext.context, locale: "en-US" }))
      .rejects.toMatchObject({
        code: "invalid-file",
        message: "The file is not a valid, complete supported image.",
      });
  });
});
