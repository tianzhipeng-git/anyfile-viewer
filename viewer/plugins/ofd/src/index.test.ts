import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentError, ViewerError } from "@anyfile/viewer-protocol";
import { createViewerTestContext, truncated, type ViewerTestContext } from "@anyfile/viewer-test";

import { ofdViewer } from "./index";
import { buildOfd } from "./test-fixtures";

const contexts: ViewerTestContext[] = [];

function context(file: File) {
  const result = createViewerTestContext(file);
  contexts.push(result);
  return result;
}

function sampleBytes(name: string) {
  return new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ViewerError);
  expect((error as ViewerError).code).toBe(code);
}

beforeEach(() => {
  // happy-dom has no Path2D; drawing is covered by painter tests with a recording context.
  vi.stubGlobal("Path2D", class { addPath() {} });
});

afterEach(() => {
  for (const item of contexts.splice(0)) item.cleanup();
  vi.unstubAllGlobals();
});

describe("OFD viewer", () => {
  it("opens a real e-invoice into the paged viewport and disposes idempotently", async () => {
    const test = context(new File([sampleBytes("invoice-sample.ofd")], "invoice.ofd"));
    const preview = vi.fn();
    const controller = await ofdViewer.open({ ...test.context, reportPreview: preview });

    expect(test.container.querySelector(".anyfile-ofd-viewer")).not.toBeNull();
    const pages = test.container.querySelectorAll<HTMLElement>(".anyfile-paged-viewer__page");
    expect(pages).toHaveLength(1);
    // The invoice page overrides the A4 document area with 210×140 mm.
    expect(Number.parseFloat(pages[0]!.style.height) / Number.parseFloat(pages[0]!.style.width)).toBeCloseTo(140 / 210, 2);
    expect(test.progress.map((item) => item.stage)).toEqual(["reading", "parsing", "ready"]);
    expect(preview).toHaveBeenCalledWith({ outcome: "success", kind: "static" });
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
  });

  it("shows the document outline", async () => {
    const test = context(buildOfd());
    await ofdViewer.open(test.context);
    const entries = Array.from(test.container.querySelectorAll(".anyfile-paged-viewer__outline-btn"), (node) => node.textContent);
    expect(entries).toEqual(expect.arrayContaining(["Cover", "Body"]));
  });

  it("rejects disguised, truncated and page-less packages without leaving DOM behind", async () => {
    const disguised = context(new File(["%PDF-1.7\n"], "disguised.ofd"));
    await expectCode(ofdViewer.open(disguised.context), "invalid-file");
    expect(disguised.container.childElementCount).toBe(0);

    const bytes = sampleBytes("ses-v4-seal.ofd");
    const cut = context(new File([truncated(bytes, bytes.length - 200).slice().buffer as ArrayBuffer], "truncated.ofd"));
    await expectCode(ofdViewer.open(cut.context), "invalid-file");
    expect(cut.container.childElementCount).toBe(0);

    await expectCode(ofdViewer.open(context(buildOfd({ overrides: { "OFD.xml": null } })).context), "invalid-file");
    const noPages = buildOfd({ overrides: { "Doc_0/Pages/Page_0/Content.xml": null, "Doc_0/Pages/Page_1/Content.xml": null } });
    await expectCode(ofdViewer.open(context(noPages).context), "invalid-file");
    const notPage = buildOfd({ overrides: { "Doc_0/Pages/Page_0/Content.xml": "<Res/>" } });
    await expectCode(ofdViewer.open(context(notPage).context), "invalid-file");
  });

  it("enforces input and nesting limits", async () => {
    const big = buildOfd();
    Object.defineProperty(big, "size", { value: 600 * 1024 * 1024 });
    await expectCode(ofdViewer.open(context(big).context), "resource-limit");

    const deep = `${"<ofd:PageBlock>".repeat(40)}${"</ofd:PageBlock>".repeat(40)}`;
    const nested = buildOfd({ overrides: { "Doc_0/Pages/Page_0/Content.xml": `<ofd:Page xmlns:ofd="x"><ofd:Content><ofd:Layer>${deep}</ofd:Layer></ofd:Content></ofd:Page>` } });
    await expectCode(ofdViewer.open(context(nested).context), "resource-limit");
  });

  it("reports unsupported environments and honours aborts before, during and after opening", async () => {
    vi.stubGlobal("Path2D", undefined);
    await expectCode(ofdViewer.open(context(buildOfd()).context), "unsupported-environment");
    vi.stubGlobal("Path2D", class { addPath() {} });

    const early = context(buildOfd());
    early.abortController.abort();
    await expect(ofdViewer.open(early.context)).rejects.toMatchObject({ name: "AbortError" });

    const during = context(buildOfd());
    const opening = ofdViewer.open(during.context);
    during.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(during.container.childElementCount).toBe(0);

    const active = context(buildOfd());
    await ofdViewer.open(active.context);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
  });

  it("captures pure page PNGs respecting maxDimension, target page switching, and AbortSignal", async () => {
    const captures: { width: number; height: number; texts: string[] }[] = [];
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      if (kind !== "2d") return null;
      const texts: string[] = [];
      (this as HTMLCanvasElement & { __capturedTexts?: string[] }).__capturedTexts = texts;
      const noop = () => {};
      const gradient = { addColorStop: noop };
      return {
        save: noop,
        restore: noop,
        beginPath: noop,
        rect: noop,
        clip: noop,
        fillRect: noop,
        fill: noop,
        stroke: noop,
        translate: noop,
        rotate: noop,
        scale: noop,
        transform: noop,
        setTransform: noop,
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, multiply: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
        setLineDash: noop,
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        createPattern: () => ({ setTransform: noop }),
        drawImage: noop,
        fillText: (text: string) => { texts.push(text); },
        strokeText: noop,
      } as unknown as CanvasRenderingContext2D;
    });
    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      type?: string,
    ) {
      const texts = (this as HTMLCanvasElement & { __capturedTexts?: string[] }).__capturedTexts ?? [];
      captures.push({ width: this.width, height: this.height, texts });
      cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: type ?? "image/png" }));
    });

    try {
      // 1. Real invoice sample (210x140 mm, 3:2 aspect ratio) scaled down to maxDimension = 420.
      const invoiceCtx = context(new File([sampleBytes("invoice-sample.ofd")], "invoice.ofd"));
      const invoiceController = await ofdViewer.open(invoiceCtx.context);
      expect(typeof invoiceController.captureImage).toBe("function");

      const invoiceBlob = await invoiceController.captureImage!({ maxDimension: 420 });
      expect(invoiceBlob).toBeInstanceOf(Blob);
      expect(invoiceBlob.type).toBe("image/png");
      expect(invoiceBlob.size).toBeGreaterThan(0);
      expect(captures.at(-1)!.width).toBe(420);
      expect(captures.at(-1)!.height).toBe(280);
      await invoiceController.dispose();

      // 2. Multi-page synthetic OFD: page 1 is 100x50 mm (2:1), page 2 is 210x297 mm (portrait).
      const multiCtx = context(buildOfd());
      const multiController = await ofdViewer.open(multiCtx.context);

      const page1Blob = await multiController.captureImage!({ maxDimension: 400 });
      expect(page1Blob.type).toBe("image/png");
      expect(captures.at(-1)!.width).toBe(400);
      expect(captures.at(-1)!.height).toBe(200);

      const page2Blob = await multiController.captureImage!({ target: "page:2", maxDimension: 400 });
      expect(page2Blob.type).toBe("image/png");
      expect(captures.at(-1)!.height).toBe(400);
      expect(captures.at(-1)!.width).toBeCloseTo(Math.round(400 * (210 / 297)), 0);
      expect(captures.at(-1)!.texts.join("")).toContain("Secondpage");

      // Plain 1-based page number target also works.
      const page2Numeric = await multiController.captureImage!({ target: "2", maxDimension: 300 });
      expect(page2Numeric.type).toBe("image/png");
      expect(captures.at(-1)!.height).toBe(300);

      // Invalid targets reject cleanly with target-not-found.
      for (const badTarget of ["page:0", "page:3", "page:abc", "sheet:1"]) {
        const error = await multiController.captureImage!({ target: badTarget, maxDimension: 400 }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).code).toBe("target-not-found");
      }

      // Invalid maxDimension rejects cleanly.
      const badDim = await multiController.captureImage!({ maxDimension: 0 }).catch((e: unknown) => e);
      expect(badDim).toBeInstanceOf(AgentError);
      expect((badDim as AgentError).code).toBe("invalid-argument");

      // Pre-aborted signal rejects with AbortError.
      const aborted = new AbortController();
      aborted.abort();
      await expect(
        multiController.captureImage!({ maxDimension: 400, signal: aborted.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });

      // Calling after dispose rejects cleanly.
      await multiController.dispose();
      await expect(multiController.captureImage!({ maxDimension: 400 })).rejects.toBeInstanceOf(ViewerError);
    } finally {
      getContextSpy.mockRestore();
      toBlobSpy.mockRestore();
    }
  });
});
