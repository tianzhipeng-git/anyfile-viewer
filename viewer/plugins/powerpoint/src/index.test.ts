import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import {
  createDeferredFile,
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

const { destroyMock, openMock, zipLimits } = vi.hoisted(() => ({
  destroyMock: vi.fn(),
  openMock: vi.fn(),
  zipLimits: { maxEntries: 4000 },
}));

vi.mock("@aiden0z/pptx-renderer", () => ({
  PptxViewer: class {
    static open = openMock;
  },
  RECOMMENDED_ZIP_LIMITS: zipLimits,
}));

import { powerpointViewer } from "./index";
import { powerpointManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

function validPptx() {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])], "slides.pptx", {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

beforeEach(() => {
  destroyMock.mockReset();
  openMock.mockReset();
  openMock.mockImplementation(async (_bytes, host: HTMLElement) => {
    const slide = document.createElement("div");
    slide.textContent = "Rendered slide";
    host.append(slide);
    return { destroy: destroyMock };
  });
});

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("PowerPoint viewer protocol compliance", () => {
  it("publishes a valid PPTX manifest", () => {
    expect(() => validateManifest(powerpointManifest)).not.toThrow();
    expect(powerpointManifest.formats.flatMap((format) => format.extensions)).toEqual([".pptx"]);
  });

  it("renders locally with lazy, windowed options and disposes repeatedly", async () => {
    const file = validPptx();
    const directRead = vi.spyOn(file, "arrayBuffer");
    const fetchRequest = vi.spyOn(globalThis, "fetch");
    const context = testContext(file);
    const controller = await powerpointViewer.open(context.context);

    expect(context.container.textContent).toContain("Rendered slide");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(directRead).not.toHaveBeenCalled();
    expect(fetchRequest).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.any(HTMLElement),
      expect.objectContaining({
        lazyMedia: true,
        lazySlides: true,
        listOptions: expect.objectContaining({ windowed: true }),
        pdfjs: false,
        signal: context.abortController.signal,
        zipLimits,
      }),
    );

    await controller.dispose();
    await controller.dispose();
    expect(destroyMock).toHaveBeenCalledOnce();
    expect(context.container.childElementCount).toBe(0);
  });

  it("rejects invalid PPTX signatures without invoking the renderer", async () => {
    const context = testContext(new File(["not a zip"], "broken.pptx"));

    await expect(powerpointViewer.open(context.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(openMock).not.toHaveBeenCalled();
    expect(context.container.childElementCount).toBe(0);
  });

  it("honors cancellation while reading", async () => {
    const deferred = createDeferredFile("delayed.pptx", 20);
    const context = testContext(deferred.file);
    const opening = powerpointViewer.open(context.context);

    context.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });

  it("destroys an active presentation when aborted", async () => {
    const context = testContext(validPptx());
    const controller = await powerpointViewer.open(context.context);

    context.abortController.abort();
    expect(destroyMock).toHaveBeenCalledOnce();
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(destroyMock).toHaveBeenCalledOnce();
  });
});
