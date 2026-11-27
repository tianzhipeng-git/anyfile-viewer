import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentError, ViewerError } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { cad2dViewer } from "./index";
// Protocol tests use the real parser/adapter; WebGL is covered by browser smoke.
vi.mock("@anyfile/rendering-3d", async (original) => {
  const actual = await original<typeof import("@anyfile/rendering-3d")>();
  return { ...actual, create3dViewer(container: HTMLElement, document: Parameters<typeof actual.create3dViewer>[1]) {
    actual.inspectObject(document.root);
    const root = window.document.createElement("div"); root.append(window.document.createElement("canvas")); container.append(root);
    return { root, dispose() { actual.disposeObject(document.root); root.remove(); } };
  } };
});
vi.mock("./parse", async () => ({ readCadScene: (source: string) => import("./scene").then(module => module.parseCadScene(source)) }));
const contexts: ViewerTestContext[] = [];
function contextFor(file: File) { const context = createViewerTestContext(file); contexts.push(context); return context; }
afterEach(() => { for (const context of contexts.splice(0)) context.cleanup(); });
describe("DXF protocol", () => {
  it("opens and cleans on active abort and repeated dispose", async () => {
    const context = contextFor(new File([readFileSync(join(process.cwd(), "examples/sample.dxf"))], "sample.dxf"));
    const controller = await cad2dViewer.open(context.context);
    expect(context.container.querySelector("canvas")).toBeTruthy();
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    context.abortController.abort(); await controller.dispose(); await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });
  it("rejects invalid and oversized input", async () => {
    const invalid = contextFor(new File(["plain text"], "bad.dxf"));
    await expect(cad2dViewer.open(invalid.context)).rejects.toMatchObject({ code: "invalid-file" });
    const file = new File(["0\nEOF\n"], "large.dxf"); Object.defineProperty(file, "size", { value: 128 * 1024 * 1024 + 1 });
    await expect(cad2dViewer.open(contextFor(file).context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("captures pure CAD PNGs respecting maxDimension, aspect ratio, layer targets, and AbortSignal", async () => {
    const captures: { width: number; height: number; strokes: number; strokeStyles: string[] }[] = [];
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      if (kind !== "2d") return null;
      const stats = { strokes: 0, strokeStyles: [] as string[] };
      (this as HTMLCanvasElement & { __cadStats?: typeof stats }).__cadStats = stats;
      let strokeStyle = "#000000";
      const noop = () => {};
      return {
        get strokeStyle() { return strokeStyle; },
        set strokeStyle(v: string) { strokeStyle = v; },
        fillStyle: "#ffffff",
        lineWidth: 1,
        lineCap: "round",
        lineJoin: "round",
        font: "12px sans-serif",
        textBaseline: "alphabetic",
        save: noop,
        restore: noop,
        beginPath: noop,
        moveTo: noop,
        lineTo: noop,
        closePath: noop,
        fillRect: noop,
        fill: noop,
        stroke: () => {
          stats.strokes += 1;
          stats.strokeStyles.push(strokeStyle);
        },
        translate: noop,
        rotate: noop,
        fillText: noop,
      } as unknown as CanvasRenderingContext2D;
    });
    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      type?: string,
    ) {
      const stats = (this as HTMLCanvasElement & { __cadStats?: { strokes: number; strokeStyles: string[] } }).__cadStats ?? {
        strokes: 0,
        strokeStyles: [],
      };
      captures.push({ width: this.width, height: this.height, ...stats });
      cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: type ?? "image/png" }));
    });

    try {
      // 1. Real sample.dxf with layers "0" and "WALLS"
      const sampleCtx = contextFor(new File([readFileSync(join(process.cwd(), "examples/sample.dxf"))], "sample.dxf"));
      const controller = await cad2dViewer.open(sampleCtx.context);
      expect(typeof controller.captureImage).toBe("function");

      const fullBlob = await controller.captureImage!({ maxDimension: 600 });
      expect(fullBlob).toBeInstanceOf(Blob);
      expect(fullBlob.type).toBe("image/png");
      expect(fullBlob.size).toBeGreaterThan(0);
      const fullCapture = captures.at(-1)!;
      expect(Math.max(fullCapture.width, fullCapture.height)).toBe(600);
      expect(fullCapture.strokes).toBeGreaterThan(2);

      // Explicit "fit" target works identically.
      const fitBlob = await controller.captureImage!({ target: "fit", maxDimension: 300 });
      expect(fitBlob.type).toBe("image/png");
      expect(Math.max(captures.at(-1)!.width, captures.at(-1)!.height)).toBe(300);

      // Layer target solos WALLS layer (2 red lines).
      const wallsBlob = await controller.captureImage!({ target: "layer:WALLS", maxDimension: 400 });
      expect(wallsBlob.type).toBe("image/png");
      const wallsCapture = captures.at(-1)!;
      expect(wallsCapture.strokes).toBe(2);
      expect(wallsCapture.strokeStyles.every((color) => color === "#ff0000")).toBe(true);

      // Invalid targets reject cleanly with target-not-found.
      for (const badTarget of ["layer:DOES_NOT_EXIST", "page:1", "unknown"]) {
        const error = await controller.captureImage!({ target: badTarget, maxDimension: 400 }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).code).toBe("target-not-found");
      }

      // Invalid maxDimension rejects cleanly.
      const badDim = await controller.captureImage!({ maxDimension: 0 }).catch((e: unknown) => e);
      expect(badDim).toBeInstanceOf(AgentError);
      expect((badDim as AgentError).code).toBe("invalid-argument");

      // Pre-aborted signal rejects with AbortError.
      const aborted = new AbortController();
      aborted.abort();
      await expect(
        controller.captureImage!({ maxDimension: 400, signal: aborted.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });

      // Calling after dispose rejects cleanly.
      await controller.dispose();
      await expect(controller.captureImage!({ maxDimension: 400 })).rejects.toBeInstanceOf(ViewerError);

      // 2. Rectangular 2:1 drawing preserves aspect ratio when scaled to maxDimension.
      const rectDxf = "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n200\n21\n0\n0\nLINE\n8\n0\n10\n200\n20\n0\n11\n200\n21\n100\n0\nENDSEC\n0\nEOF\n";
      const rectCtx = contextFor(new File([rectDxf], "rect.dxf"));
      const rectController = await cad2dViewer.open(rectCtx.context);
      await rectController.captureImage!({ maxDimension: 400 });
      const rectCapture = captures.at(-1)!;
      expect(rectCapture.width).toBe(400);
      expect(rectCapture.height).toBe(200);
      await rectController.dispose();
    } finally {
      getContextSpy.mockRestore();
      toBlobSpy.mockRestore();
    }
  });
});
