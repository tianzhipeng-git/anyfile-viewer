import { AgentError, ViewerError, abortError } from "@anyfile/viewer-protocol";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { MAX_CANVAS_PIXELS, PDF_CSS_UNITS } from "./pdf-view";

/** `page:<n>` or a bare 1-based page number; defaults to the first page. */
export function parseCaptureTarget(target: string | undefined, pageCount: number): number {
  const trimmed = target?.trim() ?? "";
  if (!trimmed) return 0;
  const page = Number(/^(?:page:)?([1-9]\d*)$/.exec(trimmed)?.[1] ?? Number.NaN);
  if (!(page >= 1 && page <= pageCount)) {
    throw new AgentError("target-not-found", `PDF page target "${target}" is out of range (1..${pageCount}).`);
  }
  return page - 1;
}

/** Renders one page (no viewer chrome) at up to 2x CSS size, bounded by `maxDimension` and the canvas pixel budget. */
export async function capturePdfPage(
  document: PDFDocumentProxy,
  pageIndex: number,
  maxDimension: number,
  signal: AbortSignal,
): Promise<Blob> {
  const page = await document.getPage(pageIndex + 1);
  const canvas = window.document.createElement("canvas");
  try {
    if (signal.aborted) throw abortError();
    const base = page.getViewport({ scale: PDF_CSS_UNITS * 2 });
    let scale = Math.min(1, maxDimension / Math.max(base.width, base.height));
    const pixels = base.width * scale * base.height * scale;
    if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
    const viewport = page.getViewport({ scale: PDF_CSS_UNITS * 2 * scale });
    canvas.width = Math.max(1, Math.min(maxDimension, Math.floor(viewport.width)));
    canvas.height = Math.max(1, Math.min(maxDimension, Math.floor(viewport.height)));
    const canvasContext = canvas.getContext("2d", { alpha: false });
    if (!canvasContext) throw new ViewerError("unsupported-environment", "Canvas 2D is unavailable.");
    const task = page.render({ canvas, canvasContext, viewport });
    const onAbort = () => task.cancel();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      await task.promise;
    } catch (error) {
      if (signal.aborted) throw abortError();
      throw error;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new ViewerError("open-failed", "Failed to encode the PDF page as PNG."));
      }, "image/png");
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
