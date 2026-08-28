import { describe, expect, it, vi } from "vitest";

const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn<(options: unknown) => { kind: string }>(() => ({ kind: "loading-task" })),
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: pdfjs.getDocument,
  GlobalWorkerOptions: {},
  version: "6.2.108",
}));

const { getPdfAssetUrls, loadPdfDocument } = await import("./pdf-engine");

describe("PDF.js support assets", () => {
  it("uses versioned same-origin resource directories", () => {
    expect(getPdfAssetUrls("https://viewer.example")).toEqual({
      cMapUrl: "https://viewer.example/vendor/pdfjs/6.2.108/cmaps/",
      iccUrl: "https://viewer.example/vendor/pdfjs/6.2.108/iccs/",
      standardFontDataUrl: "https://viewer.example/vendor/pdfjs/6.2.108/standard_fonts/",
      wasmUrl: "https://viewer.example/vendor/pdfjs/6.2.108/wasm/",
    });
  });

  it("loads with the complete support paths and keeps recoverable PDF errors non-fatal", () => {
    const loadingTask = loadPdfDocument("blob:https://viewer.example/document");

    expect(loadingTask).toEqual({ kind: "loading-task" });
    expect(pdfjs.getDocument).toHaveBeenCalledWith({
      url: "blob:https://viewer.example/document",
      ...getPdfAssetUrls(window.location.origin),
    });
    expect(pdfjs.getDocument.mock.calls[0]?.[0]).not.toHaveProperty("stopAtErrors");
  });
});
