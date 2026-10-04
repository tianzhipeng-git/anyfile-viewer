import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { animationMime, imageDecoder } from "./animation-decoder";
import { animationCopy } from "./animation-ui";
import { inspectImageFile } from "./format";
import { decodeImage } from "./image-load";
import { browserImageManifest } from "./manifest";
import { abortError, IMAGE_HEADER_BYTES, readBlob } from "./read-blob";
import { createImageViewerElements } from "./ui";
import { ImageViewport } from "./viewport";

function copyFor(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, { "zh-CN": {
    reading: "正在检查图片…",
    decoding: "正在使用浏览器解码图片…",
    ready: "图片已打开",
    invalid: "文件内容不是有效或完整的受支持图片。",
  }, en: {
    reading: "Inspecting image…",
    decoding: "Decoding image in the browser…",
    ready: "Image opened",
    invalid: "The file is not a valid, complete supported image.",
  } });
}

async function openBrowserImage(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = copyFor(context.locale);
  let objectUrl: string | undefined;
  let image: HTMLImageElement | undefined;
  let root: HTMLElement | undefined;
  let viewport: ImageViewport | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    viewport?.dispose();
    viewport = undefined;
    image?.removeAttribute("src");
    root?.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  };

  try {
    if (signal.aborted) throw abortError();
    if (file.size === 0) throw new ViewerError("invalid-file", copy.invalid);

    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const header = await readBlob(file.slice(0, IMAGE_HEADER_BYTES), signal);
    const parsedInfo = inspectImageFile(header);
    if (!parsedInfo) throw new ViewerError("invalid-file", copy.invalid);
    const info = file.size <= IMAGE_HEADER_BYTES
      ? parsedInfo
      : { ...parsedInfo, frameCount: undefined };

    reportProgress({
      stage: "rendering",
      message: copy.decoding,
      loaded: Math.min(file.size, IMAGE_HEADER_BYTES),
      total: file.size,
    });
    const mime = animationMime(info);
    const animationCandidate = info.animated || info.format === "APNG" || (info.format === "GIF" && file.size > IMAGE_HEADER_BYTES);
    let nativePreviewNotice = false;
    if (animationCandidate && mime) {
      const Decoder = imageDecoder();
      if (Decoder && await Decoder.isTypeSupported(mime)) {
        if (signal.aborted) throw abortError();
        const { openAnimation } = await import("./animation");
        const controller = await openAnimation(context, mime);
        if (controller) return controller;
      } else nativePreviewNotice = true;
    }
    if (signal.aborted) throw abortError();
    objectUrl = URL.createObjectURL(file);
    image = document.createElement("img");
    try {
      await decodeImage(image, objectUrl, signal);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new ViewerError("invalid-file", copy.invalid);
    if (signal.aborted) throw abortError();

    const elements = createImageViewerElements(file.name, info, width, height, context.locale, image);
    root = elements.root;
    if (nativePreviewNotice) {
      const notice = document.createElement("div");
      notice.className = "anyfile-browser-image-viewer__animation";
      notice.textContent = animationCopy(context.locale).unavailable;
      root.insertBefore(notice, elements.viewport);
    }
    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    viewport = new ImageViewport(elements, width, height);
    reportProgress({ stage: "ready", message: copy.ready });
    context.reportPreview?.({ outcome: "success", kind: info.animated ? "animation" : "static" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const browserImageViewer: FileViewerPlugin = {
  manifest: browserImageManifest,
  open: openBrowserImage,
};

export { browserImageManifest } from "./manifest";
