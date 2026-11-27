import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ViewerError } from "@anyfile/viewer-protocol";
import {
  assertReadsWithin,
  createTrackedFile,
  createViewerTestContext,
  expectPreviewReported,
  truncated,
} from "@anyfile/viewer-test";
import { zipSync } from "fflate";
import { designSourceManifest, designSourceViewer, parseFigmaDocument, parseSketchDocument } from "./index";
import { probeDesignSource } from "./probe";

const EXAMPLES_DIR = join(__dirname, "../examples");

function loadExample(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(EXAMPLES_DIR, name)));
}

describe("design-source-viewer", () => {
  it("exposes valid v2 manifest for .fig and .sketch", () => {
    expect(designSourceManifest.protocolVersion).toBe(2);
    expect(designSourceManifest.id).toBe("design-source");
    expect(designSourceManifest.workspaceAccess).toBe("none");
    const exts = designSourceManifest.formats.flatMap((f) => f.extensions);
    expect(exts).toContain(".fig");
    expect(exts).toContain(".sketch");
  });

  it("probes real .fig and .sketch files with bounded reads", async () => {
    for (const fileName of [
      "OpenFigs.fig",
      "circle.fig",
      "artboard-backgrounds.sketch",
      "colored-strings.sketch",
    ]) {
      const bytes = loadExample(fileName);
      const tracked = createTrackedFile(bytes, fileName);
      const controller = new AbortController();
      const level = await probeDesignSource({ file: tracked.file, signal: controller.signal });
      expect(level).toBe(3);
      assertReadsWithin(tracked.reads, [{ start: 0, end: bytes.length }]);
    }
  });

  it("rejects disguised, corrupt, truncated, and legacy SQLite .sketch files in probe", async () => {
    const controller = new AbortController();

    // Disguised text file
    const textFig = new File([new TextEncoder().encode("not a fig file at all")], "fake.fig");
    expect(await probeDesignSource({ file: textFig, signal: controller.signal })).toBe(0);

    // Random ZIP without canvas.fig or document.json
    const plainZip = zipSync({ "hello.txt": new TextEncoder().encode("hi") });
    expect(
      await probeDesignSource({
        file: new File([plainZip as BlobPart], "disguised.fig"),
        signal: controller.signal,
      }),
    ).toBe(0);
    expect(
      await probeDesignSource({
        file: new File([plainZip as BlobPart], "disguised.sketch"),
        signal: controller.signal,
      }),
    ).toBe(0);

    // Legacy pre-Sketch-43 SQLite .sketch
    const sqliteBytes = new Uint8Array(64);
    sqliteBytes.set(new TextEncoder().encode("SQLite format 3\0"));
    expect(
      await probeDesignSource({
        file: new File([sqliteBytes as BlobPart], "legacy.sketch"),
        signal: controller.signal,
      }),
    ).toBe(0);

    // Truncated real .fig
    const truncatedFig = truncated(loadExample("OpenFigs.fig"), 100);
    expect(
      await probeDesignSource({
        file: new File([truncatedFig as BlobPart], "truncated.fig"),
        signal: controller.signal,
      }),
    ).toBe(0);
  });

  it("parses real Figma .fig files (Kiwi + Zstd) into pages, layers, and thumbnail", () => {
    const openFigs = parseFigmaDocument(loadExample("OpenFigs.fig"), "OpenFigs.fig");
    expect(openFigs.format).toBe("figma");
    expect(openFigs.title).toBe("OpenFigs");
    expect(openFigs.version).toMatch(/^Kiwi v\d+$/);
    expect(openFigs.pages.length).toBeGreaterThanOrEqual(1);
    expect(openFigs.stats.nodeCount).toBeGreaterThan(0);
    expect(openFigs.thumbnail).toBeDefined();
    expect(openFigs.thumbnail!.byteLength).toBeGreaterThan(100);

    const circle = parseFigmaDocument(loadExample("circle.fig"), "circle.fig");
    expect(circle.format).toBe("figma");
    expect(circle.pages.length).toBeGreaterThanOrEqual(1);
    expect(circle.stats.nodeCount).toBeGreaterThan(0);
  });

  it("parses real Sketch .sketch files into pages, artboards, and attributedString text", () => {
    const artboardsDoc = parseSketchDocument(
      loadExample("artboard-backgrounds.sketch"),
      "artboard-backgrounds.sketch",
    );
    expect(artboardsDoc.format).toBe("sketch");
    expect(artboardsDoc.pages.length).toBeGreaterThanOrEqual(1);
    expect(artboardsDoc.stats.artboardCount).toBeGreaterThanOrEqual(1);
    expect(artboardsDoc.thumbnail).toBeDefined();

    const textDoc = parseSketchDocument(
      loadExample("colored-strings.sketch"),
      "colored-strings.sketch",
    );
    expect(textDoc.format).toBe("sketch");
    expect(textDoc.stats.textNodeCount).toBeGreaterThanOrEqual(1);
    expect(textDoc.pages[0]!.rootNodes.length).toBeGreaterThan(0);
  });

  it("opens real .fig and .sketch files in DOM, selects layers, inspects text/dimensions, and disposes cleanly", async () => {
    for (const fileName of ["OpenFigs.fig", "colored-strings.sketch"]) {
      const bytes = loadExample(fileName);
      const test = createViewerTestContext(new File([bytes as BlobPart], fileName));

      const controller = await designSourceViewer.open(test.context);
      expectPreviewReported(test, ["static"]);

      const root = test.container.querySelector(".anyfile-design-source-viewer");
      expect(root).not.toBeNull();

      // Click first layer row in layer tree
      const firstLayerBtn = root!.querySelector<HTMLButtonElement>("[data-node-id]");
      expect(firstLayerBtn).not.toBeNull();
      firstLayerBtn!.click();

      // Inspector should show geometry section (Position & Size)
      const geometrySection = root!.querySelector('[data-section="geometry"]');
      expect(geometrySection).not.toBeNull();

      // Toggle preview view if thumbnail exists
      const previewBtn = root!.querySelector<HTMLButtonElement>('[data-view-mode="preview"]');
      if (previewBtn && !previewBtn.closest("[hidden]")) {
        previewBtn.click();
        expect(root!.querySelector("[data-preview-wrap]")?.hasAttribute("hidden")).toBe(false);
      }

      // Idempotent dispose removes DOM completely
      await controller.dispose();
      await controller.dispose();
      expect(test.container.children.length).toBe(0);
    }
  });

  it("rejects corrupt input with invalid-file and leaves container clean", async () => {
    const test = createViewerTestContext(
      new File([new TextEncoder().encode("corrupt data")], "corrupt.fig"),
    );
    await expect(designSourceViewer.open(test.context)).rejects.toSatisfy(
      (err: unknown) => err instanceof ViewerError && err.code === "invalid-file",
    );
    expect(test.container.children.length).toBe(0);
  });

  it("rejects oversized input with resource-limit", async () => {
    const fakeLargeFile = new File([new Uint8Array(16)], "huge.fig");
    Object.defineProperty(fakeLargeFile, "size", { value: 200 * 1024 * 1024 });
    const test = createViewerTestContext(fakeLargeFile);
    await expect(designSourceViewer.open(test.context)).rejects.toSatisfy(
      (err: unknown) => err instanceof ViewerError && err.code === "resource-limit",
    );
    expect(test.container.children.length).toBe(0);
  });

  it("aborts cleanly during opening and active lifecycle", async () => {
    const bytes = loadExample("OpenFigs.fig");
    const abortedTest = createViewerTestContext(new File([bytes as BlobPart], "OpenFigs.fig"));
    abortedTest.abortController.abort();
    await expect(designSourceViewer.open(abortedTest.context)).rejects.toThrow(/abort/i);
    expect(abortedTest.container.children.length).toBe(0);

    // Active abort cleans up DOM
    const activeTest = createViewerTestContext(new File([bytes as BlobPart], "OpenFigs.fig"));
    const controller = await designSourceViewer.open(activeTest.context);
    expect(activeTest.container.children.length).toBe(1);
    activeTest.abortController.abort();
    expect(activeTest.container.children.length).toBe(0);
    await controller.dispose();
  });
});
