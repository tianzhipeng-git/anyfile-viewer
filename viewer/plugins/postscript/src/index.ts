import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { postscriptManifest } from "./manifest";
import { probePostscript } from "./probe";
import { readBlob } from "./read-blob";
import { PostscriptView } from "./view";
import { PostscriptWorkerClient } from "./worker-client";

const MAX_FILE_BYTES = 64 * 1024 * 1024;

const messages = {
  "zh-CN": {
    checking: "正在检查 PostScript 文件…",
    engine: "正在加载 PostScript 引擎…",
    interpreting: "正在解释 PostScript 页面…",
    ready: "PostScript 页面已准备好",
    fitWidth: "适合宽度",
    nextPage: "下一页",
    page: "第",
    pageDiscoveryFailed: "无法解析下一页。",
    previousPage: "上一页",
    renderFailed: "页面渲染失败。",
    rendering: "正在渲染页面…",
    zoomIn: "放大",
    zoomOut: "缩小",
    invalid: "文件不是有效或受支持的 PostScript 文档。",
    limit: "文件过大或处理时间超过浏览器安全限制。",
    unsupported: "当前浏览器缺少 Worker、WebAssembly 或 Canvas 2D 能力。",
    failed: "无法启动 PostScript 查看器。",
  },
  en: {
    checking: "Inspecting the PostScript file…",
    engine: "Loading the PostScript engine…",
    interpreting: "Interpreting PostScript pages…",
    ready: "PostScript pages are ready",
    fitWidth: "Fit width",
    nextPage: "Next page",
    page: "Page",
    pageDiscoveryFailed: "The next page could not be interpreted.",
    previousPage: "Previous page",
    renderFailed: "The page could not be rendered.",
    rendering: "Rendering page…",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    invalid: "The file is not a valid or supported PostScript document.",
    limit: "The file is too large or processing exceeded browser safety limits.",
    unsupported: "This browser lacks Worker, WebAssembly, or Canvas 2D support.",
    failed: "Unable to start the PostScript viewer.",
  },
};

async function openPostscript(context: OpenViewerContext): Promise<ViewerController> {
  const { file, container, signal, locale, reportProgress } = context;
  const copy = selectMessages(locale, messages);
  let client: PostscriptWorkerClient | undefined;
  let view: PostscriptView | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
    client?.dispose();
  };

  try {
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      throw new ViewerError("unsupported-environment", copy.unsupported);
    }
    if (file.size === 0) throw new ViewerError("invalid-file", copy.invalid);
    if (file.size > MAX_FILE_BYTES) throw new ViewerError("resource-limit", copy.limit);
    reportProgress({ stage: "checking", message: copy.checking });
    if (await probePostscript({ file, signal }) === 0) throw new ViewerError("invalid-file", copy.invalid);
    const buffer = await readBlob(file, signal);
    reportProgress({ stage: "engine", message: copy.engine });
    client = new PostscriptWorkerClient(signal);
    await client.initialize();
    reportProgress({ stage: "interpreting", message: copy.interpreting });
    const document = await client.open(buffer, file.name);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    view = new PostscriptView(file.name, document.pages, document.streaming, copy, client);
    container.append(view.root);
    await view.renderCurrent(true);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    view.activate();
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const code = error instanceof ViewerError ? error.code : "open-failed";
    const message = code === "resource-limit" ? copy.limit
      : code === "unsupported-environment" ? copy.unsupported
        : code === "invalid-file" ? copy.invalid
          : copy.failed;
    throw new ViewerError(code, message, { cause: error });
  }
}

export const postscriptViewer: FileViewerPlugin = {
  manifest: postscriptManifest,
  open: openPostscript,
};

export { postscriptManifest } from "./manifest";
