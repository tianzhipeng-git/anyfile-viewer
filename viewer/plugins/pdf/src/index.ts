import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { pdfManifest } from "./manifest";
import { abortError, readBlob } from "./read-blob";

const PDF_HEADER_BYTES = 1_024;

async function openPdf(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, signal } = context;
  const zh = locale.toLowerCase().startsWith("zh");
  const copy = zh ? {
    checking: "正在检查 PDF 文件…",
    invalid: "文件内容不是有效的 PDF 文档。",
    loading: "正在加载 PDF…",
    failed: "浏览器无法显示这个 PDF 文件。",
    native: "浏览器原生 PDF 渲染",
    openFailed: "无法打开 PDF 文件。",
    ready: "PDF 已打开",
  } : {
    checking: "Checking the PDF file…",
    invalid: "The file is not a valid PDF document.",
    loading: "Loading PDF…",
    failed: "The browser could not display this PDF file.",
    native: "Browser PDF renderer",
    openFailed: "Unable to open the PDF file.",
    ready: "PDF opened",
  };
  let objectUrl = "";
  let disposed = false;
  let root: HTMLElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  let loadingStatus: HTMLElement | undefined;
  const finishLoading = () => loadingStatus?.remove();
  const showLoadError = () => {
    if (loadingStatus) loadingStatus.textContent = copy.failed;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    frame?.removeEventListener("load", finishLoading);
    frame?.removeEventListener("error", showLoadError);
    root?.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };

  try {
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "validating", message: copy.checking });
    const header = new TextDecoder("latin1").decode(await readBlob(file.slice(0, PDF_HEADER_BYTES), signal));
    if (!header.includes("%PDF-")) {
      throw new ViewerError("invalid-file", copy.invalid);
    }

    objectUrl = URL.createObjectURL(file);
    root = document.createElement("div");
    root.className = "anyfile-pdf-viewer";
    root.style.cssText = "display:flex;min-height:100%;width:100%;flex-direction:column;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui)";

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid var(--viewer-border,#ddd);font-size:13px";
    const title = document.createElement("strong");
    title.textContent = file.name;
    title.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const hint = document.createElement("span");
    hint.textContent = copy.native;
    hint.style.cssText = "flex:none;color:#6b7280";
    toolbar.append(title, hint);

    frame = document.createElement("iframe");
    frame.title = file.name;
    frame.src = objectUrl;
    frame.style.cssText = "min-height:620px;width:100%;flex:1;border:0;background:#fff";
    loadingStatus = document.createElement("div");
    loadingStatus.setAttribute("role", "status");
    loadingStatus.textContent = copy.loading;
    loadingStatus.style.cssText = "padding:10px 14px;border-bottom:1px solid var(--viewer-border,#ddd);font-size:13px;color:#6b7280";
    frame.addEventListener("load", finishLoading, { once: true });
    frame.addEventListener("error", showLoadError, { once: true });
    root.append(toolbar, loadingStatus, frame);
    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("open-failed", copy.openFailed, { cause: error });
  }
}

export const pdfViewer: FileViewerPlugin = {
  manifest: pdfManifest,
  open: openPdf,
};

export { pdfManifest } from "./manifest";
