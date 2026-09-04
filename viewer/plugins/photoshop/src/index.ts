import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { inspectPhotoshopHeader, PHOTOSHOP_HEADER_BYTES } from "./format";
import { photoshopManifest } from "./manifest";
import { createPhotoshopElements } from "./ui";
import { PhotoshopViewport } from "./viewport";
import { PhotoshopDecoderWorker } from "./worker-client";

const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function openPhotoshop(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, signal } = context;
  const copy = selectMessages(locale, { "zh-CN": {
    reading: "正在检查 Photoshop 文档…", decoding: "正在 Worker 中生成合成图预览…", ready: "Photoshop 文档已打开",
    invalid: "文件内容不是有效且可预览的 PSD 或 PSB 文档。", unsupported: "当前浏览器缺少 Worker、ImageBitmap 或 Canvas 2D 能力。", limit: "PSD/PSB 文件或合成图超过浏览器安全预览上限。",
  }, en: {
    reading: "Inspecting Photoshop document…", decoding: "Building the composite preview in a worker…", ready: "Photoshop document opened",
    invalid: "The file is not a valid, previewable PSD or PSB document.", unsupported: "This browser lacks Worker, ImageBitmap or Canvas 2D support.", limit: "The PSD/PSB file or composite image exceeds the safe browser preview limit.",
  } });
  let root: HTMLElement | undefined;
  let viewport: PhotoshopViewport | undefined;
  let worker: PhotoshopDecoderWorker | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    viewport?.dispose();
    worker?.dispose();
    root?.remove();
  };

  try {
    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") throw new ViewerError("unsupported-environment", copy.unsupported);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const header = inspectPhotoshopHeader(new Uint8Array(await file.slice(0, PHOTOSHOP_HEADER_BYTES).arrayBuffer()));
    if (!header) throw new ViewerError("invalid-file", copy.invalid);
    const pixels = header.width * header.height;
    if (file.size > MAX_FILE_BYTES || !Number.isSafeInteger(pixels) || pixels > MAX_PIXELS) throw new ViewerError("resource-limit", copy.limit);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "decoding", message: copy.decoding, loaded: PHOTOSHOP_HEADER_BYTES, total: file.size });
    worker = new PhotoshopDecoderWorker(signal);
    const decoded = await worker.decode(file);
    if (signal.aborted) throw abortError();
    const bitmap = await createImageBitmap(new ImageData(decoded.rgba, decoded.info.width, decoded.info.height), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    if (signal.aborted) { bitmap.close(); throw abortError(); }
    const elements = createPhotoshopElements(file.name, decoded.info, locale);
    root = elements.root;
    container.append(root);
    viewport = new PhotoshopViewport(elements);
    viewport.setBitmap(bitmap);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ViewerError) {
      if (error.code === "resource-limit") throw new ViewerError("resource-limit", copy.limit, { cause: error });
      if (error.code === "unsupported-environment") throw error;
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const photoshopViewer: FileViewerPlugin = { manifest: photoshopManifest, open: openPhotoshop };
export { photoshopManifest } from "./manifest";
