import type { Locale } from "@anyfile/viewer-protocol";
import {
  createPagedDocumentViewport,
  paintRgbaToCanvas,
  type PageSize,
  type PagedDocumentSource,
} from "@anyfile/viewer-rendering/paged";
import { DJVU_LIMITS } from "./limits";
import type { DjvuOpenResult, DjvuPageMetrics, DjvuPageText } from "./types";
import type { DjvuCopy } from "./ui";

export interface DjvuRenderer {
  renderPage(
    pageIndex: number,
    width: number,
    height: number,
    options?: { thumbnail?: boolean; signal?: AbortSignal },
  ): Promise<{ width: number; height: number; rgba: ArrayBuffer }>;
  getPageText(pageIndex: number, signal?: AbortSignal): Promise<DjvuPageText | null>;
}

function toReferencePageSize(metrics: DjvuPageMetrics): PageSize {
  const width = Math.max(
    200,
    Math.min(1200, Math.round((metrics.width * 96) / Math.max(72, metrics.dpi || 300))),
  );
  const height = Math.max(40, Math.round((metrics.height / Math.max(1, metrics.width)) * width));
  return { width, height };
}

export function createDjvuView(
  fileName: string,
  locale: Locale,
  doc: DjvuOpenResult,
  copy: DjvuCopy,
  renderer: DjvuRenderer,
) {
  let disposed = false;
  let renderChain: Promise<void> = Promise.resolve();

  const enqueueRender = <T>(task: () => Promise<T>): Promise<T> => {
    const next = renderChain.then(task, task);
    renderChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const source: PagedDocumentSource = {
    pageCount: doc.pageCount,
    pages: doc.pages.map(toReferencePageSize),
    outline: doc.outline,
    async renderPage(pageIndex, canvas, request) {
      const metrics = doc.pages[pageIndex];
      if (!metrics) return;
      const targetW = Math.max(1, Math.min(metrics.width, Math.floor(request.displayWidth * request.pixelRatio)));
      const targetH = Math.max(1, Math.min(metrics.height, Math.floor(request.displayHeight * request.pixelRatio)));
      const result = await enqueueRender(() =>
        renderer.renderPage(pageIndex, targetW, targetH, { signal: request.signal }),
      );
      if (disposed || request.signal.aborted) return;
      paintRgbaToCanvas(canvas, result.width, result.height, result.rgba);
    },
    async renderThumbnail(pageIndex, canvas, width, height, signal) {
      const result = await enqueueRender(() =>
        renderer.renderPage(pageIndex, width, height, { thumbnail: true, signal }),
      );
      if (disposed || signal.aborted) return;
      paintRgbaToCanvas(canvas, result.width, result.height, result.rgba);
    },
    async getPageText(pageIndex, signal) {
      const text = await enqueueRender(() => renderer.getPageText(pageIndex, signal));
      if (!text) return null;
      return {
        scale: text.scale,
        words: text.words.map((word) => ({
          x: word.x,
          y: word.y,
          w: word.w,
          h: word.h,
          text: word.t,
        })),
      };
    },
    dispose() {
      disposed = true;
    },
  };

  return createPagedDocumentViewport({
    fileName,
    locale,
    className: "anyfile-djvu-viewer",
    source,
    maxRenderPixels: DJVU_LIMITS.maxRenderPixels,
    maxActiveCanvasPages: DJVU_LIMITS.maxActiveCanvasPages,
    maxActiveThumbnails: DJVU_LIMITS.maxActiveThumbnails,
    copy: {
      noOutline: copy.noOutline,
      renderFailed: copy.renderFailed,
    },
    footerLink: {
      href: "/source/djvu.html",
      label: copy.sourceNotice,
    },
  });
}
