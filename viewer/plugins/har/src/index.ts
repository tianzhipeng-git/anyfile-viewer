import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { harManifest } from "./manifest";
import { readHar } from "./parse";
import { createHarView } from "./ui";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function openHar(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, signal } = context;
  const chinese = locale.toLowerCase().startsWith("zh");
  let view: ReturnType<typeof createHarView> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    reportProgress({
      stage: "reading",
      message: chinese ? "正在读取 HAR 文件…" : "Reading HAR file…",
      loaded: 0,
      total: file.size,
    });
    const document = await readHar(file, signal, reportProgress);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "rendering", message: chinese ? "正在整理网络请求…" : "Preparing network requests…" });
    view = createHarView(file.name, document, locale);
    if (signal.aborted) throw abortError();
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: chinese ? "HAR 文件已打开" : "HAR file opened" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    throw new ViewerError(
      "invalid-file",
      chinese ? "文件已损坏，或内容不是有效的 HAR。" : "The file is damaged or is not a valid HAR file.",
      { cause: error },
    );
  }
}

export const harViewer: FileViewerPlugin = { manifest: harManifest, open: openHar };
export { harManifest } from "./manifest";
