import {
  ViewerError,
  selectMessages,
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
  const copy = selectMessages(locale, {
    en: { reading: "Reading HAR file…", rendering: "Preparing network requests…", ready: "HAR file opened", invalid: "The file is damaged or is not a valid HAR file." },
    "zh-CN": { reading: "正在读取 HAR 文件…", rendering: "正在整理网络请求…", ready: "HAR 文件已打开", invalid: "文件已损坏，或内容不是有效的 HAR。" },
  });
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
      message: copy.reading,
      loaded: 0,
      total: file.size,
    });
    const document = await readHar(file, signal, reportProgress);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "rendering", message: copy.rendering });
    view = createHarView(file.name, document, locale);
    if (signal.aborted) throw abortError();
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    throw new ViewerError(
      "invalid-file",
      copy.invalid,
      { cause: error },
    );
  }
}

export const harViewer: FileViewerPlugin = { manifest: harManifest, open: openHar };
export { harManifest } from "./manifest";
