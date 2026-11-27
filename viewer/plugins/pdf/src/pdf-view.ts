import type { Locale } from "@anyfile/viewer-protocol";
import {
  calculateFitWidthScale,
  computeCanvasPixelSize,
  createPagedDocumentViewport,
  type PagedDocumentSource,
  type PagedOutlineItem,
} from "@anyfile/viewer-rendering/paged";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

const MIN_SCALE = 0.375;
const MAX_SCALE = 3;
export const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_ACTIVE_CANVAS_PAGES = 8;
const MAX_OUTLINE_ITEMS = 500;
export const PDF_CSS_UNITS = 96 / 72;

export interface PdfCopy {
  readonly loading: string;
  readonly password: string;
  readonly passwordIncorrect: string;
  readonly passwordPrompt: string;
  readonly passwordSubmit: string;
  readonly renderFailed: string;
}

export interface PdfView {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  dispose(): void;
  requestPassword(onSubmit: (password: string) => void, incorrect: boolean): void;
  showOpenError(message: string): void;
  showDocument(document: PDFDocumentProxy): Promise<void>;
}

const PDF_OVERLAY_STYLES = `
.anyfile-pdf-viewer__password[hidden] { display: none; }
.anyfile-pdf-viewer__password {
  position: absolute;
  inset: 48px 0 0;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--viewer-surface, #e7e9ee) 92%, transparent);
  backdrop-filter: blur(5px);
}
.anyfile-pdf-viewer__password-form {
  display: grid;
  width: min(360px, 100%);
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--viewer-border, #d1d5db);
  border-radius: 14px;
  background: var(--viewer-background, #ffffff);
  box-shadow: 0 18px 50px rgb(15 23 42 / 16%);
}
.anyfile-pdf-viewer__password-title { margin: 0; font-size: 16px; }
.anyfile-pdf-viewer__password-message {
  margin: 0;
  color: var(--viewer-muted, color-mix(in srgb, var(--viewer-foreground, #111827) 62%, transparent));
  font-size: 13px;
  line-height: 1.5;
}
.anyfile-pdf-viewer__password-input {
  box-sizing: border-box;
  width: 100%;
  height: 38px !important;
  padding: 0 10px;
}
.anyfile-pdf-viewer__password-submit { justify-self: end; }
`;

export function calculateFitScale(
  viewportWidth: number,
  pageWidth: number,
  paddingLeft: number,
  paddingRight: number,
): number {
  return calculateFitWidthScale(viewportWidth, pageWidth, paddingLeft + paddingRight, MIN_SCALE, MAX_SCALE);
}

function isPdfCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

interface RawPdfOutlineNode {
  readonly title?: string;
  readonly dest?: string | readonly unknown[] | null;
  readonly items?: readonly RawPdfOutlineNode[];
}

async function resolveOutlinePageIndex(
  document: PDFDocumentProxy,
  dest: string | readonly unknown[] | null | undefined,
): Promise<number> {
  if (!dest) return -1;
  try {
    const resolved = typeof dest === "string"
      ? await document.getDestination(dest)
      : dest;
    if (!Array.isArray(resolved) || resolved.length === 0) return -1;
    const ref = resolved[0];
    if (typeof ref === "number" && Number.isInteger(ref) && ref >= 0) return ref;
    if (ref && typeof ref === "object") {
      return await document.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
    }
  } catch {
    return -1;
  }
  return -1;
}

async function loadPdfOutline(
  document: PDFDocumentProxy,
  isDisposed: () => boolean,
): Promise<PagedOutlineItem[]> {
  if (typeof document.getOutline !== "function") return [];
  let rawOutline: readonly RawPdfOutlineNode[] | null = null;
  try {
    rawOutline = await document.getOutline();
  } catch {
    return [];
  }
  if (!rawOutline || rawOutline.length === 0 || isDisposed()) return [];

  let remaining = MAX_OUTLINE_ITEMS;
  const convert = async (nodes: readonly RawPdfOutlineNode[]): Promise<PagedOutlineItem[]> => {
    const result: PagedOutlineItem[] = [];
    for (const node of nodes) {
      if (isDisposed() || remaining <= 0) break;
      remaining -= 1;
      const page = await resolveOutlinePageIndex(document, node.dest);
      if (isDisposed()) break;
      const children = node.items?.length ? await convert(node.items) : [];
      result.push({ title: node.title ?? "", page, children });
    }
    return result;
  };
  return convert(rawOutline);
}

export function createPdfView(fileName: string, locale: Locale, copy: PdfCopy): PdfView {
  const pagedView = createPagedDocumentViewport({
    fileName,
    locale,
    className: "anyfile-pdf-viewer",
    initialStatus: copy.loading,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    maxRenderPixels: MAX_CANVAS_PIXELS,
    maxActiveCanvasPages: MAX_ACTIVE_CANVAS_PAGES,
    copy: {
      renderFailed: copy.renderFailed,
    },
  });

  const overlayStyle = document.createElement("style");
  overlayStyle.textContent = PDF_OVERLAY_STYLES;

  const passwordPanel = document.createElement("div");
  passwordPanel.className = "anyfile-pdf-viewer__password";
  passwordPanel.hidden = true;
  const passwordForm = document.createElement("form");
  passwordForm.className = "anyfile-pdf-viewer__password-form";
  const passwordTitle = document.createElement("h2");
  passwordTitle.className = "anyfile-pdf-viewer__password-title";
  passwordTitle.textContent = copy.password;
  const passwordMessage = document.createElement("p");
  passwordMessage.className = "anyfile-pdf-viewer__password-message";
  const passwordInput = document.createElement("input");
  passwordInput.className = "anyfile-pdf-viewer__password-input";
  passwordInput.type = "password";
  passwordInput.required = true;
  passwordInput.autocomplete = "current-password";
  passwordInput.setAttribute("aria-label", copy.password);
  const passwordSubmit = document.createElement("button");
  passwordSubmit.type = "submit";
  passwordSubmit.className = "anyfile-pdf-viewer__password-submit";
  passwordSubmit.textContent = copy.passwordSubmit;
  passwordSubmit.title = copy.passwordSubmit;
  passwordSubmit.setAttribute("aria-label", copy.passwordSubmit);
  passwordForm.append(passwordTitle, passwordMessage, passwordInput, passwordSubmit);
  passwordPanel.append(passwordForm);
  pagedView.root.append(overlayStyle, passwordPanel);

  let disposed = false;
  let submitPassword: ((password: string) => void) | undefined;

  const onPasswordSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!submitPassword) return;
    const submit = submitPassword;
    submitPassword = undefined;
    passwordPanel.hidden = true;
    submit(passwordInput.value);
    passwordInput.value = "";
  };
  passwordForm.addEventListener("submit", onPasswordSubmit);

  return {
    root: pagedView.root,
    viewport: pagedView.viewport,
    requestPassword(onSubmit, incorrect) {
      if (disposed) return;
      submitPassword = onSubmit;
      passwordMessage.textContent = incorrect ? copy.passwordIncorrect : copy.passwordPrompt;
      passwordPanel.hidden = false;
      passwordInput.value = "";
      passwordInput.focus();
    },
    showOpenError(message) {
      if (disposed) return;
      passwordPanel.hidden = true;
      pagedView.showStatus(message, { isError: true });
    },
    async showDocument(documentProxy) {
      if (disposed) return;
      const loadedPages = new Map<number, PDFPageProxy>();
      const activeRenderTasks = new Map<number, RenderTask>();
      let sourceDisposed = false;
      let defaultPageSize = { width: 816, height: 1056 };

      if (documentProxy.numPages > 0) {
        const firstPage = await documentProxy.getPage(1);
        if (disposed) {
          firstPage.cleanup();
          return;
        }
        loadedPages.set(0, firstPage);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        defaultPageSize = {
          width: firstViewport.width * PDF_CSS_UNITS,
          height: firstViewport.height * PDF_CSS_UNITS,
        };
      }

      const source: PagedDocumentSource = {
        pageCount: documentProxy.numPages,
        defaultPageSize,
        async renderPage(pageIndex, canvas, request) {
          let page = loadedPages.get(pageIndex);
          if (!page) {
            page = await documentProxy.getPage(pageIndex + 1);
            if (disposed || sourceDisposed || request.signal.aborted) {
              page.cleanup();
              return;
            }
            loadedPages.set(pageIndex, page);
          }

          activeRenderTasks.get(pageIndex)?.cancel();
          const pdfScale = request.scale * PDF_CSS_UNITS;
          const viewportAtScale = page.getViewport({ scale: pdfScale });
          const baseViewport = page.getViewport({ scale: 1 });
          const { width, height, pixelRatio } = computeCanvasPixelSize(
            viewportAtScale.width,
            viewportAtScale.height,
            request.pixelRatio,
            request.maxPixels,
          );
          canvas.width = width;
          canvas.height = height;
          const canvasContext = canvas.getContext("2d", { alpha: false });
          if (!canvasContext) throw new Error("Canvas 2D is unavailable.");

          const renderTask = page.render({
            canvas,
            canvasContext,
            viewport: viewportAtScale,
            transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          });
          activeRenderTasks.set(pageIndex, renderTask);
          const onAbort = () => renderTask.cancel();
          request.signal.addEventListener("abort", onAbort, { once: true });
          try {
            await renderTask.promise;
            return {
              width: baseViewport.width * PDF_CSS_UNITS,
              height: baseViewport.height * PDF_CSS_UNITS,
            };
          } catch (error) {
            if (isPdfCancelled(error) || request.signal.aborted) {
              throw new DOMException("Viewer operation aborted.", "AbortError");
            }
            throw error;
          } finally {
            request.signal.removeEventListener("abort", onAbort);
            if (activeRenderTasks.get(pageIndex) === renderTask) {
              activeRenderTasks.delete(pageIndex);
            }
          }
        },
        async renderThumbnail(pageIndex, canvas, targetWidth, _targetHeight, signal) {
          const cached = loadedPages.get(pageIndex);
          const page = cached ?? await documentProxy.getPage(pageIndex + 1);
          if (disposed || sourceDisposed || signal.aborted) {
            if (!cached) page.cleanup();
            return;
          }
          const base = page.getViewport({ scale: 1 });
          const thumbScale = base.width > 0 ? targetWidth / base.width : 0.2;
          const thumbViewport = page.getViewport({ scale: thumbScale });
          canvas.width = Math.max(1, Math.floor(thumbViewport.width));
          canvas.height = Math.max(1, Math.floor(thumbViewport.height));
          const canvasContext = canvas.getContext("2d", { alpha: false });
          if (!canvasContext) {
            if (!cached) page.cleanup();
            return;
          }
          const task = page.render({ canvas, canvasContext, viewport: thumbViewport });
          const onAbort = () => task.cancel();
          signal.addEventListener("abort", onAbort, { once: true });
          try {
            await task.promise;
          } catch (error) {
            if (!isPdfCancelled(error) && !signal.aborted) throw error;
          } finally {
            signal.removeEventListener("abort", onAbort);
            if (!cached) page.cleanup();
          }
        },
        onEvictPage(pageIndex) {
          activeRenderTasks.get(pageIndex)?.cancel();
          activeRenderTasks.delete(pageIndex);
          const page = loadedPages.get(pageIndex);
          if (page) {
            page.cleanup();
            loadedPages.delete(pageIndex);
          }
        },
        dispose() {
          if (sourceDisposed) return;
          sourceDisposed = true;
          for (const task of activeRenderTasks.values()) task.cancel();
          activeRenderTasks.clear();
          for (const page of loadedPages.values()) page.cleanup();
          loadedPages.clear();
        },
      };

      pagedView.setSource(source);
      void loadPdfOutline(documentProxy, () => disposed || sourceDisposed).then((outline) => {
        if (!disposed && !sourceDisposed && outline.length > 0) {
          pagedView.setOutline(outline);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      passwordForm.removeEventListener("submit", onPasswordSubmit);
      submitPassword = undefined;
      pagedView.dispose();
    },
  };
}

export async function destroyPdfTask(task: PDFDocumentLoadingTask | undefined) {
  if (task && !task.destroyed) await task.destroy();
}
