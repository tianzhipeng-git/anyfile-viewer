import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentError, validateManifest } from "@anyfile/viewer-protocol";
import {
  createDeferredFile,
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

const pdfEngine = vi.hoisted(() => ({
  loadPdfDocument: vi.fn(),
}));

vi.mock("./pdf-engine", () => pdfEngine);

import { pdfViewer } from "./index";
import { pdfManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

function validPdf() {
  return new File(["%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"], "document.pdf", {
    type: "application/pdf",
  });
}

function mockPdfDocument() {
  const render = vi.fn(() => ({
    cancel: vi.fn(),
    promise: Promise.resolve(),
  }));
  const cleanup = vi.fn();
  const page = {
    cleanup,
    getViewport: ({ scale }: { scale: number }) => ({ height: 800 * scale, width: 600 * scale }),
    render,
  };
  const document = {
    getPage: vi.fn().mockResolvedValue(page),
    numPages: 1,
  };
  const task = {
    destroyed: false,
    destroy: vi.fn(async () => {
      task.destroyed = true;
    }),
    onProgress: vi.fn(),
    promise: Promise.resolve(document),
  };
  pdfEngine.loadPdfDocument.mockReturnValue(task);
  return { cleanup, document, render, task };
}

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("PDF viewer protocol compliance", () => {
  it("publishes a valid v1 manifest", () => {
    expect(() => validateManifest(pdfManifest)).not.toThrow();
    expect(pdfManifest.formats.flatMap((format) => format.extensions)).toEqual([".pdf", ".ai"]);
  });

  it("opens through a sliced read and releases its Object URL on repeated dispose", async () => {
    const pdf = mockPdfDocument();
    const file = validPdf();
    const directRead = vi.spyOn(file, "arrayBuffer");
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#pdf-test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchRequest = vi.spyOn(globalThis, "fetch");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const context = testContext(file);

    const controller = await pdfViewer.open(context.context);

    await vi.waitFor(() => expect(pdf.document.getPage).toHaveBeenCalledWith(1));

    expect(context.container.querySelector("iframe")).toBeNull();
    const canvas = context.container.querySelector<HTMLCanvasElement>(".anyfile-pdf-viewer canvas");
    expect(canvas).not.toBeNull();
    expect(pdfEngine.loadPdfDocument).toHaveBeenCalledWith("about:blank#pdf-test");
    expect(pdf.document.getPage).toHaveBeenCalledWith(1);
    expect(pdf.render).toHaveBeenCalledOnce();
    expect(context.progress.at(-1)?.stage).toBe("loading");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(directRead).not.toHaveBeenCalled();
    expect(fetchRequest).not.toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledOnce();

    const initialWidth = canvas?.width ?? 0;
    (context.container.querySelector('[aria-label="放大"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(canvas?.width).toBeGreaterThan(initialWidth);
    expect(pdf.render).toHaveBeenCalledTimes(2);

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(pdf.cleanup).toHaveBeenCalledOnce();
    expect(pdf.task.destroy).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
  });

  it("cleans partial state when opening an invalid file fails", async () => {
    const context = testContext(new File(["not a pdf"], "broken.pdf"));

    await expect(pdfViewer.open(context.context)).rejects.toMatchObject({
      code: "invalid-file",
    });
    expect(context.container.childElementCount).toBe(0);
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("honors cancellation during opening", async () => {
    const deferred = createDeferredFile("delayed.pdf", 40);
    const context = testContext(deferred.file);
    const opening = pdfViewer.open(context.context);

    context.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });

  it("uses the requested locale for user-facing errors", async () => {
    const context = testContext(new File(["not a pdf"], "broken.pdf"));
    const localizedContext = { ...context.context, locale: "en" as const };

    await expect(pdfViewer.open(localizedContext)).rejects.toMatchObject({
      code: "invalid-file",
      message: "The file is not a valid PDF document.",
    });
  });

  it("disposes immediately when an active viewer is aborted", async () => {
    const pdf = mockPdfDocument();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#active-pdf");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const context = testContext(validPdf());
    const controller = await pdfViewer.open(context.context);

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);

    await controller.dispose();
    expect(pdf.task.destroy).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
  });

  it("keeps the viewer visible while requesting and submitting a PDF password", async () => {
    const pdf = mockPdfDocument();
    let resolveDocument!: (document: typeof pdf.document) => void;
    pdf.task.promise = new Promise((resolve) => {
      resolveDocument = resolve;
    });
    const task = pdf.task as typeof pdf.task & {
      onPassword?: (updatePassword: (password: string) => void, reason: number) => void;
    };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#protected-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const context = testContext(validPdf());
    const controller = await pdfViewer.open(context.context);

    await vi.waitFor(() => expect(task.onPassword).toBeTypeOf("function"));
    const updatePassword = vi.fn((password: string) => {
      expect(password).toBe("secret");
      resolveDocument(pdf.document);
    });
    task.onPassword?.(updatePassword, 1);

    const passwordPanel = context.container.querySelector<HTMLElement>(".anyfile-pdf-viewer__password");
    const passwordInput = context.container.querySelector<HTMLInputElement>("input[type=password]");
    expect(passwordPanel?.hidden).toBe(false);
    expect(context.progress.at(-1)?.stage).toBe("loading");
    expect(passwordInput?.getAttribute("aria-label")).toBe("PDF 密码");

    passwordInput!.value = "secret";
    context.container.querySelector<HTMLFormElement>("form")!.requestSubmit();
    await vi.waitFor(() => expect(pdf.document.getPage).toHaveBeenCalledWith(1));

    expect(updatePassword).toHaveBeenCalledOnce();
    expect(passwordPanel?.hidden).toBe(true);
    expect(context.progress.at(-1)?.stage).toBe("loading");
    await controller.dispose();
  });

  it("shows failures from post-open loading inside the active viewer", async () => {
    const pdf = mockPdfDocument();
    pdf.task.promise = Promise.reject(Object.assign(new Error("broken xref"), {
      name: "InvalidPDFException",
    }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#late-invalid-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const context = testContext(validPdf());

    const controller = await pdfViewer.open(context.context);

    await vi.waitFor(() => {
      expect(context.container.querySelector('[role="alert"]')?.textContent)
        .toBe("文件内容不是有效的 PDF 文档。");
    });
    expect(context.container.querySelector(".anyfile-pdf-viewer")).not.toBeNull();
    await controller.dispose();
  });

  it("loads PDF outline bookmarks and evicts offscreen page proxies on large documents", async () => {
    const cleanups: number[] = [];
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      cleanup: vi.fn(() => cleanups.push(idx)),
      getViewport: ({ scale }: { scale: number }) => ({ height: 800 * scale, width: 600 * scale }),
      render: vi.fn(() => ({ cancel: vi.fn(), promise: Promise.resolve() })),
    }));
    const document = {
      numPages: 12,
      getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
      getOutline: vi.fn(async () => [{ title: "Section 10", dest: [{ num: 10 }], items: [] }]),
      getPageIndex: vi.fn(async () => 9),
    };
    const task = {
      destroyed: false,
      destroy: vi.fn(async () => {
        task.destroyed = true;
      }),
      promise: Promise.resolve(document),
    };
    pdfEngine.loadPdfDocument.mockReturnValue(task);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#outline-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);

    const context = testContext(validPdf());
    const controller = await pdfViewer.open(context.context);

    await vi.waitFor(() => {
      expect(context.container.querySelector(".anyfile-paged-viewer__outline-btn")?.textContent)
        .toBe("Section 10");
    });

    // Click outline item to jump directly to page 10 without loading pages 2..9
    (context.container.querySelector(".anyfile-paged-viewer__outline-btn") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.getPage).toHaveBeenCalledWith(10));

    // Jump through 9 more pages to exceed the 8-page active canvas budget and trigger eviction cleanup
    const pageInput = context.container.querySelector(".anyfile-paged-viewer__page-input") as HTMLInputElement;
    for (let pageNumber = 2; pageNumber <= 9; pageNumber += 1) {
      pageInput.value = String(pageNumber);
      pageInput.dispatchEvent(new Event("change"));
      await Promise.resolve();
    }
    await vi.waitFor(() => expect(cleanups.length).toBeGreaterThan(0));

    await controller.dispose();
  });

  it("captures a bounded PNG of the requested page without viewer chrome", async () => {
    const pdf = mockPdfDocument();
    pdf.document.numPages = 2;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#capture-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const captures: { width: number; height: number }[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
      captures.push({ width: this.width, height: this.height });
      cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: type ?? "image/png" }));
    });
    const context = testContext(validPdf());
    const controller = await pdfViewer.open(context.context);
    expect(typeof controller.captureImage).toBe("function");

    const blob = await controller.captureImage!({ target: "page:2", maxDimension: 400 });
    expect(blob.type).toBe("image/png");
    expect(pdf.document.getPage).toHaveBeenCalledWith(2);
    expect(captures.at(-1)).toEqual({ width: 300, height: 400 });

    await controller.captureImage!({ target: "1", maxDimension: 10_000 });
    expect(captures.at(-1)).toEqual({ width: 1600, height: 2133 });

    for (const target of ["page:0", "page:3", "sheet:1"]) {
      const error = await controller.captureImage!({ target, maxDimension: 400 }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).code).toBe("target-not-found");
    }
    await controller.dispose();
  });

  it("rejects captures of a locked PDF with encrypted-file", async () => {
    const pdf = mockPdfDocument();
    pdf.task.promise = new Promise(() => undefined);
    const task = pdf.task as typeof pdf.task & { onPassword?: (update: (password: string) => void, reason: number) => void };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#locked-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const context = testContext(validPdf());
    const controller = await pdfViewer.open(context.context);
    await vi.waitFor(() => expect(task.onPassword).toBeTypeOf("function"));
    task.onPassword?.(() => undefined, 1);

    await expect(controller.captureImage!({ maxDimension: 400 })).rejects.toMatchObject({ code: "encrypted-file" });
    await controller.dispose();
  });
});
