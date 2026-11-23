import type { Locale } from "@anyfile/viewer-protocol";
import {
  createPagedDocumentViewport,
  type PageSize,
  type PagedDocumentSource,
  type PagedTextLayer,
} from "@anyfile/viewer-rendering/paged";

import { OfdAssets, type OfdImage } from "./assets";
import { loadOfdDocument, type OfdDocument } from "./document";
import { OFD_LIMITS } from "./limits";
import { loadOfdPage, type OfdPage } from "./model";
import { OfdPackage } from "./package";
import { paintPage } from "./painter";
import { extractPageText } from "./text";
import type { OfdCopy } from "./ui";

/** OFD lengths are millimetres; the paged viewport sizes pages in CSS pixels at 100%. */
const PX_PER_MM = 96 / 25.4;
const PARSED_PAGE_CACHE = 8;

/** Rasterises the first page of a seal stored as a nested OFD (no further nesting). */
export async function rasterizeSealDocument(bytes: Uint8Array, signal: AbortSignal): Promise<OfdImage | null> {
  const pkg = await OfdPackage.open(new Blob([bytes as Uint8Array<ArrayBuffer>]), signal);
  const assets = new OfdAssets(pkg);
  try {
    const page = await loadOfdPage(await loadOfdDocument(pkg), 0);
    const loaded = await assets.acquire(page);
    try {
      const area = page.width * page.height;
      const scale = Math.min(OFD_LIMITS.sealPixelsPerMm, Math.sqrt(OFD_LIMITS.sealMaxPixels / area));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(page.width * scale));
      canvas.height = Math.max(1, Math.round(page.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(canvas.width / page.width, 0, 0, canvas.height / page.height, 0, 0);
      paintPage(ctx, page, loaded, true);
      return {
        source: canvas,
        pixels: canvas.width * canvas.height,
        close: () => {
          canvas.width = 0;
        },
      };
    } finally {
      loaded.release();
    }
  } finally {
    assets.dispose();
    await pkg.close();
  }
}

export function createOfdView(fileName: string, locale: Locale, doc: OfdDocument, firstPage: OfdPage, copy: OfdCopy, signal: AbortSignal) {
  let disposed = false;
  const assets = new OfdAssets(doc.pkg, (bytes) => rasterizeSealDocument(bytes, signal));
  const pages = new Map<number, Promise<OfdPage>>([[0, Promise.resolve(firstPage)]]);
  const texts = new Map<number, PagedTextLayer | null>();

  const page = (index: number) => {
    let promise = pages.get(index);
    if (promise) {
      pages.delete(index);
    } else {
      promise = loadOfdPage(doc, index);
      promise.catch(() => pages.delete(index));
    }
    pages.set(index, promise);
    for (const key of pages.keys()) {
      if (pages.size <= PARSED_PAGE_CACHE) break;
      if (key !== index) pages.delete(key);
    }
    return promise;
  };

  const draw = async (index: number, canvas: HTMLCanvasElement, width: number, height: number, drawSignal: AbortSignal) => {
    const model = await page(index);
    if (disposed || drawSignal.aborted) return undefined;
    const loaded = await assets.acquire(model);
    try {
      if (disposed || drawSignal.aborted) return undefined;
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.setTransform(canvas.width / model.width, 0, 0, canvas.height / model.height, 0, 0);
      paintPage(ctx, model, loaded);
      if (!texts.has(index)) texts.set(index, extractPageText(model));
      return model;
    } finally {
      loaded.release();
    }
  };

  const size = (width: number, height: number): PageSize => ({ width: width * PX_PER_MM, height: height * PX_PER_MM });
  const fallback = size(firstPage.width, firstPage.height);
  const source: PagedDocumentSource = {
    pageCount: doc.pages.length,
    pages: doc.pages.map((_, index) => (index === 0 ? fallback : size(doc.pageArea.width, doc.pageArea.height))),
    defaultPageSize: fallback,
    outline: doc.outline,
    async renderPage(index, canvas, request) {
      const model = await draw(
        index,
        canvas,
        request.displayWidth * request.pixelRatio,
        request.displayHeight * request.pixelRatio,
        request.signal,
      );
      return model ? size(model.width, model.height) : undefined;
    },
    async renderThumbnail(index, canvas, width, height, thumbSignal) {
      await draw(index, canvas, width, height, thumbSignal);
    },
    async getPageText(index) {
      if (texts.has(index)) return texts.get(index) ?? null;
      return extractPageText(await page(index));
    },
    dispose() {
      disposed = true;
    },
  };

  const viewport = createPagedDocumentViewport({
    fileName,
    locale,
    className: "anyfile-ofd-viewer",
    source,
    maxRenderPixels: OFD_LIMITS.maxRenderPixels,
    maxActiveCanvasPages: OFD_LIMITS.maxActiveCanvasPages,
    maxActiveThumbnails: OFD_LIMITS.maxActiveThumbnails,
    copy: { noOutline: copy.noOutline, renderFailed: copy.renderFailed },
  });

  return {
    root: viewport.root,
    dispose() {
      viewport.dispose();
      disposed = true;
      assets.dispose();
      void doc.pkg.close();
    },
  };
}
