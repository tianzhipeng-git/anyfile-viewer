import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createDeferredFile, createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { safeSvgViewer } from "./index";
import { safeSvgManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];
function contextFor(file: File) {
  const context = createViewerTestContext(file);
  activeContexts.push(context);
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:safe-svg");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(96);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(64);
});
afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("safe SVG viewer protocol compliance", () => {
  it("publishes SVG and SVGZ in a valid manifest", () => {
    expect(() => validateManifest(safeSvgManifest)).not.toThrow();
    expect(safeSvgManifest.formats[0].extensions).toEqual([".svg", ".svgz"]);
  });

  it("renders a real SVG fixture and disposes resources idempotently", async () => {
    const bytes = readFileSync(join(process.cwd(), "examples/sample.svg"));
    const context = contextFor(new File([bytes], "sample.svg"));
    const controller = await safeSvgViewer.open(context.context);

    expect(context.container.querySelector<HTMLImageElement>(".anyfile-svg-viewer__image")?.src).toBe("blob:safe-svg");
    expect(context.container.textContent).toContain("SVG · 96 × 64");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("sanitizes active content before creating the render Blob", async () => {
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"><script>alert(1)</script><image href="https://example.com/a.png"/></svg>'], "unsafe.svg");
    const context = contextFor(file);
    const controller = await safeSvgViewer.open(context.context);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const sanitized = await blob.text();

    expect(sanitized).not.toMatch(/script|onload|example\.com/);
    expect(context.container.textContent).toContain("已移除 3 项不安全内容");
    await controller.dispose();
  });

  it("decompresses and renders SVGZ", async () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    const compressed = new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"));
    const context = contextFor(new File([await new Response(compressed).blob()], "sample.svgz"));
    const controller = await safeSvgViewer.open(context.context);

    expect(context.container.textContent).toContain("SVGZ · 96 × 64");
    await controller.dispose();
  });

  it("rejects invalid and oversized SVG files", async () => {
    const invalid = contextFor(new File(["plain text"], "bad.svg"));
    await expect(safeSvgViewer.open(invalid.context)).rejects.toMatchObject({ code: "invalid-file" });

    const oversizedFile = new File(["<svg/>"], "large.svg");
    Object.defineProperty(oversizedFile, "size", { value: 17 * 1024 * 1024 });
    const oversized = contextFor(oversizedFile);
    await expect(safeSvgViewer.open(oversized.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("cleans the active viewer when aborted", async () => {
    const bytes = readFileSync(join(process.cwd(), "examples/sample.svg"));
    const context = contextFor(new File([bytes], "sample.svg"));
    const controller = await safeSvgViewer.open(context.context);
    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("cancels an unfinished SVG read", async () => {
    const deferred = createDeferredFile("delayed.svg", 1_024);
    Object.defineProperty(deferred.file, "stream", {
      value: () => deferred.file.slice().stream(),
    });
    const context = contextFor(deferred.file);
    const opening = safeSvgViewer.open(context.context);

    context.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });
});
