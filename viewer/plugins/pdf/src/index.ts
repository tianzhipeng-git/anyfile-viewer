import {
  AgentError,
  ViewerError,
  selectMessages,
  type CaptureImageOptions,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
  abortError,
} from "@anyfile/viewer-protocol";
import { PasswordResponses, type PDFDocumentLoadingTask } from "pdfjs-dist";

import { capturePdfPage, parseCaptureTarget } from "./capture";
import { loadPdfDocument } from "./pdf-engine";
import { createPdfView, destroyPdfTask } from "./pdf-view";
import { pdfManifest } from "./manifest";
import { probePdf } from "./probe";

function getCopy(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, { "zh-CN": {
    checking: "正在检查 PDF 文件…",
    invalid: "文件内容不是有效的 PDF 文档。",
    loading: "正在加载 PDF…",
    openFailed: "无法打开 PDF 文件。",
    password: "PDF 密码",
    passwordIncorrect: "密码不正确，请重新输入。",
    passwordPrompt: "这个 PDF 受密码保护，请输入打开密码。",
    passwordSubmit: "解锁",
    renderFailed: "部分页面渲染失败，请尝试调整缩放或重新打开文件。",
  }, en: {
    checking: "Checking the PDF file…",
    invalid: "The file is not a valid PDF document.",
    loading: "Loading PDF…",
    openFailed: "Unable to open the PDF file.",
    password: "PDF password",
    passwordIncorrect: "The password is incorrect. Try again.",
    passwordPrompt: "This PDF is password protected. Enter its password to open it.",
    passwordSubmit: "Unlock",
    renderFailed: "Some pages could not be rendered. Try changing the zoom or reopening the file.",
  } });
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
  const view = createPdfView(file.name, context.locale, copy);
  let objectUrl = "";
  let loadingTask: PDFDocumentLoadingTask | undefined;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  // Settles with an encrypted-file error once pdf.js asks for a password, so captures never hang on the prompt.
  const passwordGate = Promise.withResolvers<never>();
  passwordGate.promise.catch(() => undefined);

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
    if (await probePdf({ file, signal }) === 0) {
      throw new ViewerError("invalid-file", copy.invalid);
    }

    objectUrl = URL.createObjectURL(file);
    container.append(view.root);
    signal.addEventListener("abort", onAbort, { once: true });
    reportProgress({ stage: "loading", message: copy.loading });
    loadingTask = loadPdfDocument(objectUrl);
    loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      if (disposed) return;
      passwordGate.reject(new AgentError("encrypted-file", "The PDF is password protected."));
      view.requestPassword((password) => {
        if (disposed) return;
        updatePassword(password);
      }, reason === PasswordResponses.INCORRECT_PASSWORD);
    };
    void loadingTask.promise.then(async (document) => {
      if (signal.aborted || disposed) return;
      await view.showDocument(document);
    }).catch((error: unknown) => {
      if (signal.aborted || disposed) return;
      view.showOpenError(isInvalidPdfError(error) ? copy.invalid : copy.openFailed);
    });
    const task = loadingTask;
    const captureImage = async (options: CaptureImageOptions): Promise<Blob> => {
      if (options.signal?.aborted) throw abortError();
      if (disposed) throw new ViewerError("open-failed", "PDF viewer has been disposed.");
      if (!Number.isFinite(options.maxDimension) || options.maxDimension < 1) {
        throw new AgentError("invalid-argument", "maxDimension must be a positive number.");
      }
      // A document unlocked through the prompt wins: `task.promise` is listed first.
      const document = await Promise.race([task.promise, passwordGate.promise]);
      if (disposed) throw new ViewerError("open-failed", "PDF viewer has been disposed.");
      const captureSignal = options.signal ? AbortSignal.any([signal, options.signal]) : signal;
      return capturePdfPage(document, parseCaptureTarget(options.target, document.numPages), Math.round(options.maxDimension), captureSignal);
    };
    return { dispose, captureImage };
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
