import { AgentError, ViewerError, abortError, type CaptureImageOptions } from "@anyfile/viewer-protocol";
import { paintRgbaToCanvas } from "@anyfile/viewer-rendering/paged";
import type { DjvuRenderer } from "./djvu-view";
import { DJVU_LIMITS } from "./limits";
import type { DjvuOpenResult } from "./types";

/** `page:<n>` or a bare 1-based page number; defaults to the first page. */
export function parseCaptureTarget(target: string | undefined, pageCount: number): number {
  const trimmed = target?.trim() ?? "";
  if (!trimmed) return 0;
  const page = Number(/^(?:page:)?([1-9]\d*)$/.exec(trimmed)?.[1] ?? Number.NaN);
  if (!(page >= 1 && page <= pageCount)) {
    throw new AgentError("target-not-found", `DjVu page target "${target}" is out of range (1..${pageCount}).`);
  }
  return page - 1;
}

/** Decodes one page (no viewer chrome) at up to its source resolution, bounded by `maxDimension` and the render pixel budget. */
export async function captureDjvuPage(
  doc: DjvuOpenResult,
  renderer: DjvuRenderer,
  options: CaptureImageOptions,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw abortError();
  if (!Number.isFinite(options.maxDimension) || options.maxDimension < 1) {
    throw new AgentError("invalid-argument", "maxDimension must be a positive number.");
  }
  const pageIndex = parseCaptureTarget(options.target, doc.pageCount);
  const metrics = doc.pages[pageIndex]!;
  const maxDimension = Math.round(options.maxDimension);
  let scale = Math.min(1, maxDimension / Math.max(metrics.width, metrics.height));
  const pixels = metrics.width * scale * metrics.height * scale;
  if (pixels > DJVU_LIMITS.maxRenderPixels) scale *= Math.sqrt(DJVU_LIMITS.maxRenderPixels / pixels);
  const width = Math.max(1, Math.min(maxDimension, Math.floor(metrics.width * scale)));
  const height = Math.max(1, Math.min(maxDimension, Math.floor(metrics.height * scale)));

  const result = await renderer.renderPage(pageIndex, width, height, { signal });
  if (signal.aborted) throw abortError();
  const canvas = document.createElement("canvas");
  try {
    paintRgbaToCanvas(canvas, result.width, result.height, result.rgba);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new ViewerError("open-failed", "Failed to encode the DjVu page as PNG."));
      }, "image/png");
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
