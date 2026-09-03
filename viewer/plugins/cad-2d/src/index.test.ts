import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { cad2dViewer } from "./index";
import { cad2dManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];

function contextFor(file: File) {
  const context = createViewerTestContext(file);
  activeContexts.push(context);
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    fillText() {},
    arc() {},
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
    lineJoin: "round",
    lineCap: "round",
    strokeStyle: "#000",
    fillStyle: "#000",
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("CAD 2D viewer protocol compliance", () => {
  it("publishes DXF in a valid manifest", () => {
    expect(() => validateManifest(cad2dManifest)).not.toThrow();
    expect(cad2dManifest.formats[0].extensions).toEqual([".dxf"]);
  });

  it("renders a real DXF fixture and disposes idempotently", async () => {
    const bytes = readFileSync(join(process.cwd(), "examples/sample.dxf"));
    const context = contextFor(new File([bytes], "sample.dxf"));
    const controller = await cad2dViewer.open(context.context);

    expect(context.container.querySelector("canvas")).toBeTruthy();
    expect(context.container.textContent).toContain("DXF");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });

  it("rejects invalid and oversized DXF files", async () => {
    const invalid = contextFor(new File(["plain text"], "bad.dxf"));
    await expect(cad2dViewer.open(invalid.context)).rejects.toMatchObject({ code: "invalid-file" });

    const oversized = new File(["0\nEOF\n"], "large.dxf");
    Object.defineProperty(oversized, "size", { value: 65 * 1024 * 1024 });
    const oversizedContext = contextFor(oversized);
    await expect(cad2dViewer.open(oversizedContext.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("cleans the active viewer when aborted", async () => {
    const bytes = readFileSync(join(process.cwd(), "examples/sample.dxf"));
    const context = contextFor(new File([bytes], "sample.dxf"));
    const controller = await cad2dViewer.open(context.context);
    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
  });
});
