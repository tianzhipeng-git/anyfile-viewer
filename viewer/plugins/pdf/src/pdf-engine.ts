import {
  getDocument,
  GlobalWorkerOptions,
  version,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function getPdfAssetUrls(origin: string) {
  const baseUrl = new URL(`/vendor/pdfjs/${version}/`, origin);
  return {
    cMapUrl: new URL("cmaps/", baseUrl).toString(),
    iccUrl: new URL("iccs/", baseUrl).toString(),
    standardFontDataUrl: new URL("standard_fonts/", baseUrl).toString(),
    wasmUrl: new URL("wasm/", baseUrl).toString(),
  };
}

export function loadPdfDocument(url: string): PDFDocumentLoadingTask {
  return getDocument({
    url,
    ...getPdfAssetUrls(window.location.origin),
  });
}
