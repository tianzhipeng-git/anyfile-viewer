import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { inspectImageFile } from "./format";
import { decodeImage } from "./image-load";
import { browserImageManifest } from "./manifest";
import { abortError, IMAGE_HEADER_BYTES, readBlob } from "./read-blob";
import { createImageViewerElements } from "./ui";
import { ImageViewport } from "./viewport";

function copyFor(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? {
    reading: "正在检查图片…",
    decoding: "正在使用浏览器解码图片…",
    ready: "图片已打开",
    invalid: "文件内容不是有效或完整的受支持图片。",
    avifSequence: "当前阶段尚未支持 AVIF 图像序列。",
  } : {
    reading: "Inspecting image…",
    decoding: "Decoding image in the browser…",
    ready: "Image opened",
    invalid: "The file is not a valid, complete supported image.",
    avifSequence: "AVIF image sequences are not supported in this stage.",
  };
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
    if (parsedInfo.format === "AVIF" && parsedInfo.animated) {
      throw new ViewerError("open-failed", copy.avifSequence);
    }
    const info = file.size <= IMAGE_HEADER_BYTES
      ? parsedInfo
      : { ...parsedInfo, frameCount: undefined };

    reportProgress({
      stage: "rendering",
      message: copy.decoding,
      loaded: Math.min(file.size, IMAGE_HEADER_BYTES),
      total: file.size,
    });
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
    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    viewport = new ImageViewport(elements, width, height);
    reportProgress({ stage: "ready", message: copy.ready });
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
