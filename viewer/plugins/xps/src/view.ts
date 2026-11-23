import type { Locale } from "@anyfile/viewer-protocol";
import {
  createPagedDocumentViewport,
  type PageSize,
  type PagedDocumentSource,
  type PagedTextLayer,
} from "@anyfile/viewer-rendering/paged";

import type { XpsDocumentModel } from "./document";
import { XPS_LIMITS } from "./limits";
import { buildPage, dictionarySources, type XpsPage } from "./model";
import { XpsFormatError, type XpsPackage } from "./package";
import { paintPage } from "./painter";
import type { XpsResources } from "./resources";
import { extractPageText } from "./text";
import type { XpsCopy } from "./ui";
import { parseXml } from "./xml";

const PARSED_PAGE_CACHE = 8;

/** Parses one FixedPage part (plus any remote resource dictionaries it references). */
export async function loadXpsPage(pkg: XpsPackage, part: string): Promise<XpsPage> {
  const root = parseXml(await pkg.text(part));
  if (root.localName !== "FixedPage") throw new XpsFormatError("Not a FixedPage.");
  const dictionaries = new Map<string, Element>();
  for (const source of dictionarySources(root, part)) {
    if (!pkg.has(source)) continue;
    const dictionary = parseXml(await pkg.text(source));
    if (dictionary.localName === "ResourceDictionary") dictionaries.set(source, dictionary);
  }
  return buildPage(root, part, dictionaries);
}

export function createXpsView(
  fileName: string,
  locale: Locale,
  doc: XpsDocumentModel,
  firstPage: XpsPage,
  pkg: XpsPackage,
  resources: XpsResources,
  copy: XpsCopy,
) {
  let disposed = false;
  const pages = new Map<number, Promise<XpsPage>>([[0, Promise.resolve(firstPage)]]);
  const texts = new Map<number, PagedTextLayer | null>();

  const page = (index: number) => {
    let promise = pages.get(index);
    if (promise) {
      pages.delete(index);
    } else {
      const ref = doc.pages[index];
      if (!ref) return Promise.reject(new XpsFormatError("Page out of range."));
      promise = loadXpsPage(pkg, ref.part);
      promise.catch(() => pages.delete(index));
    }
    pages.set(index, promise);
    for (const key of pages.keys()) {
      if (pages.size <= PARSED_PAGE_CACHE) break;
      if (key !== index) pages.delete(key);
    }
    return promise;
  };

  const draw = async (index: number, canvas: HTMLCanvasElement, width: number, height: number, signal: AbortSignal) => {
    const model = await page(index);
    if (disposed || signal.aborted) return undefined;
    const loaded = await resources.acquire(model.fonts, model.images);
    try {
      if (disposed || signal.aborted) return undefined;
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.setTransform(canvas.width / model.width, 0, 0, canvas.height / model.height, 0, 0);
      paintPage(ctx, model, loaded);
      if (!texts.has(index)) texts.set(index, extractPageText(model, loaded.fonts));
      return model;
    } finally {
      loaded.release();
    }
  };

  const fallback = { width: firstPage.width, height: firstPage.height };
  const source: PagedDocumentSource = {
    pageCount: doc.pages.length,
    pages: doc.pages.map((ref, index): PageSize =>
      index === 0
        ? fallback
        : { width: ref.width ?? fallback.width, height: ref.height ?? fallback.height },
    ),
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
      return model ? { width: model.width, height: model.height } : undefined;
    },
    async renderThumbnail(index, canvas, width, height, signal) {
      await draw(index, canvas, width, height, signal);
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
    className: "anyfile-xps-viewer",
    source,
    maxRenderPixels: XPS_LIMITS.maxRenderPixels,
    maxActiveCanvasPages: XPS_LIMITS.maxActiveCanvasPages,
    maxActiveThumbnails: XPS_LIMITS.maxActiveThumbnails,
    copy: { noOutline: copy.noOutline, renderFailed: copy.renderFailed },
  });

  return {
    root: viewport.root,
    dispose() {
      viewport.dispose();
      disposed = true;
      resources.dispose();
      void pkg.close();
    },
  };
}
