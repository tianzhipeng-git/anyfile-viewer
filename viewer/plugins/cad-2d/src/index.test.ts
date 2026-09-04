import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { cad2dViewer } from "./index";
import { cad2dManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];
let canvasContext: {
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
};

function contextFor(file: File) {
  const context = createViewerTestContext(file);
  activeContexts.push(context);
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  canvasContext = {
    setTransform() {},
    clearRect() {},
    beginPath() {},
    moveTo: vi.fn(),
    lineTo: vi.fn(),
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
  } as unknown as typeof canvasContext;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
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

  it("fits sub-unit model-space geometry to a visible canvas size", async () => {
    const source = "0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n0.1\n21\n0.05\n0\nENDSEC\n0\nEOF\n";
    const context = contextFor(new File([source], "small-units.dxf"));
    const controller = await cad2dViewer.open(context.context);

    await vi.waitFor(() => expect(canvasContext.lineTo).toHaveBeenCalled());
    const [startX, startY] = canvasContext.moveTo.mock.calls.at(-1) as [number, number];
    const [endX, endY] = canvasContext.lineTo.mock.calls.at(-1) as [number, number];
    expect(Math.hypot(endX - startX, endY - startY)).toBeGreaterThan(100);

    await controller.dispose();
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
