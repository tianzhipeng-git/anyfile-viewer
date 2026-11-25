import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertReadsWithin,
  createTrackedFile,
  createViewerTestContext,
  expectPreviewReported,
} from "@anyfile/viewer-test";
import { ViewerError } from "@anyfile/viewer-protocol";
import { ExrDocument } from "./exr-decoder";
import { createHdrImageViewer } from "./index";
import { probeHdrImage } from "./probe";
import { decodeRadianceHdr } from "./radiance-hdr";
import { buildSyntheticExr, encodeRadianceHdr } from "./test-fixtures";
import { HDR_PROBE_BYTES, MAX_HDR_INPUT_BYTES } from "./types";
import type { HdrDecoderSession } from "./worker-client";

const EXAMPLES_DIR = resolve(__dirname, "../examples");

function createInProcessSession(): HdrDecoderSession & { disposed: boolean } {
  let doc: ExrDocument | undefined;
  const session: HdrDecoderSession & { disposed: boolean } = {
    disposed: false,
    async open(file) {
      if (file.size > MAX_HDR_INPUT_BYTES) {
        throw new ViewerError("resource-limit", "File exceeds budget.");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01) {
        doc = ExrDocument.parse(bytes);
        return doc.decodeLayer(0);
      }
      doc = undefined;
      return decodeRadianceHdr(bytes);
    },
    async select(partIndex, layerId) {
      if (!doc) throw new ViewerError("open-failed", "No EXR document loaded.");
      return doc.decodeLayer(partIndex, layerId);
    },
    dispose() {
      session.disposed = true;
    },
  };
  return session;
}

function mockCanvas2d() {
  const original = HTMLCanvasElement.prototype.getContext;
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext = vi.fn((type: string) => {
    if (type === "2d") return ctx;
    return null;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return () => {
    HTMLCanvasElement.prototype.getContext = original;
  };
}

describe("probeHdrImage", () => {
  it("identifies real OpenEXR and Radiance HDR samples within bounded header reads", async () => {
    const exrBytes = new Uint8Array(readFileSync(resolve(EXAMPLES_DIR, "all-half-values.exr")));
    const exrTracked = createTrackedFile(exrBytes, "all-half-values.exr");
    const exrLevel = await probeHdrImage({ file: exrTracked.file, signal: new AbortController().signal });
    expect(exrLevel).toBe(4);
    assertReadsWithin(exrTracked.reads, [{ start: 0, end: HDR_PROBE_BYTES }]);

    const hdrBytes = new Uint8Array(readFileSync(resolve(EXAMPLES_DIR, "studio-gradient.hdr")));
    const hdrTracked = createTrackedFile(hdrBytes, "studio-gradient.hdr");
    const hdrLevel = await probeHdrImage({ file: hdrTracked.file, signal: new AbortController().signal });
    expect(hdrLevel).toBe(4);
    assertReadsWithin(hdrTracked.reads, [{ start: 0, end: HDR_PROBE_BYTES }]);
  });

  it("returns 0 for disguised, corrupt, or truncated headers", async () => {
    const signal = new AbortController().signal;
    expect(await probeHdrImage({ file: new File(["not an exr"], "disguised.exr"), signal })).toBe(0);
    expect(await probeHdrImage({ file: new File(["#?RADIANCE\nNOFORMAT\n"], "corrupt.hdr"), signal })).toBe(0);
    expect(await probeHdrImage({ file: new File([new Uint8Array([0x76, 0x2f])], "truncated.exr"), signal })).toBe(0);
  });
});

describe("hdrImageViewer lifecycle & UI", () => {
  it("opens a multi-AOV EXR, reports preview, switches AOV, adjusts controls, and disposes cleanly", async () => {
    const restoreCanvas = mockCanvas2d();
    const session = createInProcessSession();
    const viewer = createHdrImageViewer(() => session);
    const exrBytes = buildSyntheticExr({
      width: 16,
      height: 8,
      compression: 3,
      envmap: 0,
      channels: [
        { name: "R", pixelType: 1, valueAt: () => 2.0 },
        { name: "G", pixelType: 1, valueAt: () => 1.0 },
        { name: "B", pixelType: 1, valueAt: () => 0.5 },
        { name: "A", pixelType: 1, valueAt: () => 1.0 },
        { name: "diffuse.R", pixelType: 1, valueAt: () => 0.8 },
        { name: "diffuse.G", pixelType: 1, valueAt: () => 0.4 },
        { name: "diffuse.B", pixelType: 1, valueAt: () => 0.2 },
      ],
    });

    try {
      const test = createViewerTestContext(new File([exrBytes], "scene.exr"));
      const controller = await viewer.open(test.context);
      expectPreviewReported(test, ["static"]);

      const root = test.container.querySelector(".anyfile-hdr");
      expect(root).not.toBeNull();

      // Switch AOV layer
      const selects = test.container.querySelectorAll("select");
      const layerSelect = selects[1];
      expect(layerSelect.options.length).toBe(2);
      layerSelect.value = "layer:diffuse";
      layerSelect.dispatchEvent(new Event("change"));
      await Promise.resolve();

      // Toggle 360° mode (gracefully falls back when WebGL is null in happy-dom)
      const buttons = [...test.container.querySelectorAll("button")];
      const btn360 = buttons.find((b) => b.textContent?.includes("360°"));
      btn360?.click();
      expect(test.container.querySelector(".hdr-status")?.textContent).toContain("WebGL");

      // Adjust exposure & reset
      const rangeInputs = test.container.querySelectorAll<HTMLInputElement>('input[type="range"]');
      rangeInputs[0].value = "2.5";
      rangeInputs[0].dispatchEvent(new Event("input"));

      // Dispose twice cleanly
      await controller.dispose();
      await controller.dispose();
      expect(session.disposed).toBe(true);
      expect(test.container.childElementCount).toBe(0);
    } finally {
      restoreCanvas();
    }
  });

  it("rejects invalid files and resource-limit files without leaving DOM residue", async () => {
    const restoreCanvas = mockCanvas2d();
    const viewer = createHdrImageViewer(() => createInProcessSession());
    try {
      const bad = createViewerTestContext(new File(["garbage"], "bad.hdr"));
      await expect(viewer.open(bad.context)).rejects.toMatchObject({ name: "ViewerError", code: "invalid-file" });
      expect(bad.container.childElementCount).toBe(0);

      const bigFile = new File([encodeRadianceHdr(4, 4, () => [1, 1, 1])], "huge.hdr");
      Object.defineProperty(bigFile, "size", { value: MAX_HDR_INPUT_BYTES + 1 });
      const overBudget = createViewerTestContext(bigFile);
      await expect(viewer.open(overBudget.context)).rejects.toMatchObject({ name: "ViewerError", code: "resource-limit" });
      expect(overBudget.container.childElementCount).toBe(0);
    } finally {
      restoreCanvas();
    }
  });

  it("aborts cleanly before and after open", async () => {
    const restoreCanvas = mockCanvas2d();
    const session = createInProcessSession();
    const viewer = createHdrImageViewer(() => session);
    try {
      const preAborted = createViewerTestContext(new File([encodeRadianceHdr(4, 4, () => [1, 1, 1])], "a.hdr"));
      preAborted.abortController.abort();
      await expect(viewer.open(preAborted.context)).rejects.toMatchObject({ name: "AbortError" });

      const active = createViewerTestContext(new File([encodeRadianceHdr(4, 4, () => [1, 1, 1])], "b.hdr"));
      await viewer.open(active.context);
      active.abortController.abort();
      expect(session.disposed).toBe(true);
      expect(active.container.childElementCount).toBe(0);
    } finally {
      restoreCanvas();
    }
  });
});
