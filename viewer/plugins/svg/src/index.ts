import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { safeSvgManifest } from "./manifest";
import { abortError, readSvgBytes, SVG_INPUT_LIMIT } from "./read";
import { sanitizeSvg } from "./sanitize";
import { createSvgUi } from "./ui";

function copyFor(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? {
    reading: "正在读取并清理 SVG…", rendering: "正在渲染安全 SVG…", ready: "SVG 已打开",
    invalid: "文件内容不是有效或完整的 SVG。", limit: `SVG 解压后的大小不能超过 ${SVG_INPUT_LIMIT / 1024 / 1024} MiB。`,
    unsupported: "当前浏览器无法解压 SVGZ。",
  } : {
    reading: "Reading and sanitizing SVG…", rendering: "Rendering safe SVG…", ready: "SVG opened",
    invalid: "The file is not a valid, complete SVG.", limit: `The decompressed SVG must not exceed ${SVG_INPUT_LIMIT / 1024 / 1024} MiB.`,
    unsupported: "This browser cannot decompress SVGZ files.",
  };
}

async function decode(image: HTMLImageElement, source: string, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      image.onload = null; image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => { image.removeAttribute("src"); finish(abortError()); };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("SVG decoding failed."));
    signal.addEventListener("abort", onAbort, { once: true });
    image.src = source;
    if (typeof image.decode === "function") void image.decode().then(() => finish(), finish);
  });
}

async function openSafeSvg(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = copyFor(context.locale);
  let objectUrl: string | undefined;
  let image: HTMLImageElement | undefined;
  let root: HTMLElement | undefined;
  let interactive: { dispose(): void } | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    interactive?.dispose(); interactive = undefined;
    image?.removeAttribute("src"); root?.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  };

  try {
    if (signal.aborted) throw abortError();
    if (file.size === 0) throw new ViewerError("invalid-file", copy.invalid);
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    let input: Awaited<ReturnType<typeof readSvgBytes>>;
    try {
      input = await readSvgBytes(file, signal);
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof RangeError) throw new ViewerError("resource-limit", copy.limit, { cause: error });
      if (error instanceof TypeError) throw new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
      throw error;
    }
    const sanitized = sanitizeSvg(input.bytes);
    if (!sanitized) throw new ViewerError("invalid-file", copy.invalid);
    reportProgress({ stage: "rendering", message: copy.rendering, loaded: file.size, total: file.size });
    objectUrl = URL.createObjectURL(new Blob([sanitized.source], { type: "image/svg+xml" }));
    image = document.createElement("img");
    try {
      await decode(image, objectUrl, signal);
    } catch (error) {
      if (signal.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new ViewerError("invalid-file", copy.invalid);
    const ui = createSvgUi(file.name, width, height, sanitized.removedItems, input.compressed, context.locale, image);
    root = ui.root; interactive = ui.interactive; container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const safeSvgViewer: FileViewerPlugin = { manifest: safeSvgManifest, open: openSafeSvg };
export { safeSvgManifest } from "./manifest";
