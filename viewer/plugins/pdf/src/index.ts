import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";
import { PasswordResponses, type PDFDocumentLoadingTask } from "pdfjs-dist";

import { loadPdfDocument } from "./pdf-engine";
import { createPdfView, destroyPdfTask } from "./pdf-view";
import { pdfManifest } from "./manifest";
import { abortError, readBlob } from "./read-blob";

const PDF_HEADER_BYTES = 1_024;

function getCopy(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? {
    checking: "正在检查 PDF 文件…",
    fitWidth: "适合宽度",
    invalid: "文件内容不是有效的 PDF 文档。",
    loading: "正在加载 PDF…",
    nextPage: "下一页",
    openFailed: "无法打开 PDF 文件。",
    page: "第",
    password: "PDF 密码",
    passwordIncorrect: "密码不正确，请重新输入。",
    passwordPrompt: "这个 PDF 受密码保护，请输入打开密码。",
    passwordSubmit: "解锁",
    previousPage: "上一页",
    ready: "PDF 已打开",
    renderFailed: "部分页面渲染失败，请尝试调整缩放或重新打开文件。",
    zoomIn: "放大",
    zoomOut: "缩小",
  } : {
    checking: "Checking the PDF file…",
    fitWidth: "Fit width",
    invalid: "The file is not a valid PDF document.",
    loading: "Loading PDF…",
    nextPage: "Next page",
    openFailed: "Unable to open the PDF file.",
    page: "Page",
    password: "PDF password",
    passwordIncorrect: "The password is incorrect. Try again.",
    passwordPrompt: "This PDF is password protected. Enter its password to open it.",
    passwordSubmit: "Unlock",
    previousPage: "Previous page",
    ready: "PDF opened",
    renderFailed: "Some pages could not be rendered. Try changing the zoom or reopening the file.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
  };
}

function isInvalidPdfError(error: unknown) {
  return error instanceof Error && [
    "InvalidPDFException",
    "MissingPDFException",
    "UnexpectedResponseException",
  ].includes(error.name);
}

async function openPdf(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = getCopy(context.locale);
  const view = createPdfView(file.name, copy);
  let objectUrl = "";
  let loadingTask: PDFDocumentLoadingTask | undefined;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;

  const dispose = () => {
    if (disposePromise) return disposePromise;
    disposed = true;
    signal.removeEventListener("abort", onAbort);
    view.dispose();
    disposePromise = (async () => {
      await destroyPdfTask(loadingTask);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    })();
    return disposePromise;
  };
  const onAbort = () => void dispose();

  try {
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "validating", message: copy.checking });
    const header = new TextDecoder("latin1").decode(
      await readBlob(file.slice(0, PDF_HEADER_BYTES), signal),
    );
    if (!header.includes("%PDF-")) throw new ViewerError("invalid-file", copy.invalid);

    objectUrl = URL.createObjectURL(file);
    container.append(view.root);
    signal.addEventListener("abort", onAbort, { once: true });
    reportProgress({ stage: "loading", message: copy.loading });
    loadingTask = loadPdfDocument(objectUrl);
    loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      if (disposed) return;
      reportProgress({ stage: "awaiting-input", message: copy.passwordPrompt });
      view.requestPassword((password) => {
        if (disposed) return;
        reportProgress({ stage: "loading", message: copy.loading });
        updatePassword(password);
      }, reason === PasswordResponses.INCORRECT_PASSWORD);
    };
    loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (!disposed) reportProgress({ stage: "loading", message: copy.loading, loaded, total });
    };
    const document = await loadingTask.promise;
    if (signal.aborted || disposed) throw abortError();
    await view.showDocument(document);
    if (signal.aborted || disposed) throw abortError();
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    await dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
    if (signal.aborted) throw abortError();
    if (isInvalidPdfError(error)) throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    throw new ViewerError("open-failed", copy.openFailed, { cause: error });
  }
}

export const pdfViewer: FileViewerPlugin = {
  manifest: pdfManifest,
  open: openPdf,
};

export { pdfManifest } from "./manifest";
