import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import {
  createDeferredFile,
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

import { hexViewer } from "./index";
import { hexManifest } from "./manifest";

const contexts: ViewerTestContext[] = [];

function testContext(bytes: Uint8Array, name = "sample.bin") {
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  const context = createViewerTestContext(file);
  contexts.push(context);
  return context;
}

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

describe("hex viewer", () => {
  it("publishes a wildcard manifest", () => {
    expect(() => validateManifest(hexManifest)).not.toThrow();
    expect(hexManifest.formats[0].extensions).toEqual(["*"]);
  });

  it("renders offsets, hexadecimal bytes, and printable ASCII from a sliced read", async () => {
    const bytes = Uint8Array.of(0x00, 0x20, 0x41, 0x7e, 0x7f, 0xff);
    const context = testContext(bytes);
    const directRead = vi.spyOn(context.context.file, "arrayBuffer");
    const slicedRead = vi.spyOn(context.context.file, "slice");

    const controller = await hexViewer.open(context.context);
    const row = context.container.querySelector<HTMLElement>("[data-offset='0']")!;

    expect(row.querySelector(".anyfile-hex-viewer__offset")?.textContent).toBe("00000000");
    expect(row.querySelector(".anyfile-hex-viewer__hex")?.textContent).toContain("00 20 41 7E 7F FF");
    expect(row.querySelector(".anyfile-hex-viewer__text")?.textContent).toBe("· A~··");
    expect(context.container.textContent).toContain("位置");
    expect(context.container.textContent).toContain("文本");
    expect(directRead).not.toHaveBeenCalled();
    expect(slicedRead).toHaveBeenCalledOnce();
    expect(context.progress.at(-1)?.stage).toBe("ready");

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });

  it("renders an empty-file state while retaining the three-column header", async () => {
    const context = testContext(new Uint8Array());
    const controller = await hexViewer.open(context.context);

    expect(context.container.textContent).toContain("这是一个空文件");
    expect(context.container.querySelector(".anyfile-hex-viewer__header")?.children).toHaveLength(3);
    await controller.dispose();
  });

  it("loads a new byte range when the virtual viewport scrolls", async () => {
    const bytes = Uint8Array.from({ length: 8192 }, (_, index) => index % 256);
    const context = testContext(bytes);
    const slicedRead = vi.spyOn(context.context.file, "slice");
    const controller = await hexViewer.open(context.context);
    const viewport = context.container.querySelector<HTMLElement>(".anyfile-hex-viewer__viewport")!;

    viewport.scrollTop = 2400;
    viewport.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => {
      expect(context.container.querySelector("[data-offset='1520']")).not.toBeNull();
    });

    expect(slicedRead).toHaveBeenCalledTimes(2);
    await controller.dispose();
  });

  it("cleans active content when aborted", async () => {
    const context = testContext(Uint8Array.of(1, 2, 3));
    const controller = await hexViewer.open(context.context);

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    await controller.dispose();
  });

  it("cancels a pending sliced read during opening", async () => {
    const deferred = createDeferredFile("pending.binary", 1024);
    const context = createViewerTestContext(deferred.file);
    contexts.push(context);
    const opening = hexViewer.open(context.context);

    context.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });
});
