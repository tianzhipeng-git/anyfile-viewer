import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import {
  createDeferredFile,
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

const { renderAsyncMock } = vi.hoisted(() => ({ renderAsyncMock: vi.fn() }));

vi.mock("docx-preview", () => ({ renderAsync: renderAsyncMock }));

import { wordViewer } from "./index";
import { wordManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

function validDocx() {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])], "document.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

beforeEach(() => {
  renderAsyncMock.mockReset();
  renderAsyncMock.mockImplementation(async (_bytes, host: HTMLElement, styleHost: HTMLElement) => {
    styleHost.innerHTML = "";
    host.innerHTML = "";
    const generatedStyle = document.createElement("style");
    generatedStyle.textContent = ".anyfile-docx { color: black; }";
    styleHost.append(generatedStyle);
    const paragraph = document.createElement("p");
    paragraph.textContent = "Rendered document";
    const unsafeLink = document.createElement("a");
    unsafeLink.href = "javascript:alert(1)";
    unsafeLink.textContent = "Unsafe link";
    host.append(paragraph, unsafeLink);
  });
});

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("Word viewer protocol compliance", () => {
  it("publishes a valid DOCX manifest", () => {
    expect(() => validateManifest(wordManifest)).not.toThrow();
    expect(wordManifest.formats.flatMap((format) => format.extensions)).toEqual([".docx"]);
  });

  it("renders locally with safe options and disposes repeatedly", async () => {
    const file = validDocx();
    const directRead = vi.spyOn(file, "arrayBuffer");
    const fetchRequest = vi.spyOn(globalThis, "fetch");
    const context = testContext(file);
    const controller = await wordViewer.open(context.context);

    expect(context.container.textContent).toContain("Rendered document");
    expect(context.container.textContent).toContain("document.docx");
    expect(context.container.querySelector(".anyfile-word-viewer__document")?.isConnected).toBe(true);
    expect(context.container.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(context.container.querySelector("a")?.rel).toBe("noreferrer noopener");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(directRead).not.toHaveBeenCalled();
    expect(fetchRequest).not.toHaveBeenCalled();
    expect(renderAsyncMock).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.any(HTMLElement),
      expect.any(HTMLElement),
      expect.objectContaining({ renderAltChunks: false, useBase64URL: false }),
    );

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });

  it("rejects invalid DOCX signatures without invoking the renderer", async () => {
    const context = testContext(new File(["not a zip"], "broken.docx"));

    await expect(wordViewer.open(context.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(renderAsyncMock).not.toHaveBeenCalled();
    expect(context.container.childElementCount).toBe(0);
  });

  it("honors cancellation while reading", async () => {
    const deferred = createDeferredFile("delayed.docx", 20);
    const context = testContext(deferred.file);
    const opening = wordViewer.open(context.context);

    context.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });

  it("disposes an active document when aborted", async () => {
    const context = testContext(validDocx());
    const controller = await wordViewer.open(context.context);

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });
});
