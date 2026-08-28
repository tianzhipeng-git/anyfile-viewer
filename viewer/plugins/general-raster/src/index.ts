import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { CanvasRasterViewport } from "./canvas-viewport";
import { generalRasterManifest } from "./manifest";
import { createRasterViewerElements, updateRasterMetadata, type RasterViewerElements } from "./ui";
import { RasterDecoderWorker } from "./worker-client";

const messages = {
  zh: {
    reading: "正在检查栅格图片…",
    decoding: "正在 Worker 中解码图片…",
    ready: "图片已准备好",
    page: "正在解码页面…",
    pageError: "页面解码失败",
    unsupported: "当前浏览器缺少 Worker、ImageBitmap 或 Canvas 2D 能力。",
  },
  en: {
    reading: "Inspecting raster image…",
    decoding: "Decoding image in a worker…",
    ready: "Image ready",
    page: "Decoding page…",
    pageError: "Page decoding failed",
    unsupported: "This browser lacks Worker, ImageBitmap, or Canvas 2D support.",
  },
} as const;

async function openGeneralRaster(context: OpenViewerContext): Promise<ViewerController> {
  const { file, container, signal, locale, reportProgress } = context;
  const copy = locale.toLowerCase().startsWith("zh") ? messages.zh : messages.en;
  let root: HTMLDivElement | undefined;
  let elements: RasterViewerElements | undefined;
  let viewport: CanvasRasterViewport | undefined;
  let worker: RasterDecoderWorker | undefined;
  let disposed = false;
  let pageChange: ((event: Event) => void) | undefined;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (elements && pageChange) elements.pageSelect.removeEventListener("change", pageChange);
    viewport?.dispose();
    worker?.dispose();
    root?.remove();
    root = undefined;
  };

  try {
    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
      throw new ViewerError("unsupported-environment", copy.unsupported);
    }
    reportProgress({ stage: "reading", message: copy.reading });
    worker = new RasterDecoderWorker(signal);
    reportProgress({ stage: "decoding", message: copy.decoding });
    const raster = await worker.decode(file, 0);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");

    elements = createRasterViewerElements(file.name, locale);
    root = elements.root;
    container.append(root);
    viewport = new CanvasRasterViewport(elements);
    await viewport.setRaster(raster.rgba, raster.width, raster.height);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    updateRasterMetadata(elements, raster, locale);
    signal.addEventListener("abort", dispose, { once: true });

    pageChange = () => {
      if (!elements || !viewport || !worker || disposed) return;
      const pageIndex = Number(elements.pageSelect.value);
      elements.pageSelect.disabled = true;
      elements.status.textContent = copy.page;
      void worker.decode(file, pageIndex).then(async (page) => {
        if (disposed || !elements || !viewport) return;
        await viewport.setRaster(page.rgba, page.width, page.height);
        if (disposed || !elements) return;
        updateRasterMetadata(elements, page, locale);
        elements.status.textContent = "";
      }).catch((error: unknown) => {
        if (disposed || !elements || (error instanceof DOMException && error.name === "AbortError")) return;
        elements.status.textContent = copy.pageError;
      }).finally(() => {
        if (!disposed && elements) elements.pageSelect.disabled = false;
      });
    };
    elements.pageSelect.addEventListener("change", pageChange);
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", locale.toLowerCase().startsWith("zh") ? "图片文件无效或无法解码。" : "The image is invalid or cannot be decoded.", { cause: error });
  }
}

export const generalRasterViewer: FileViewerPlugin = {
  manifest: generalRasterManifest,
  open: openGeneralRaster,
};

export { generalRasterManifest } from "./manifest";
