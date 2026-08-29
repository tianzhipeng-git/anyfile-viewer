import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;
const DEFAULT_SCALE = 4 / 3;
const PAGE_BATCH_SIZE = 12;
const MAX_CANVAS_PIXELS = 16_000_000;

interface PdfCopy {
  fitWidth: string;
  loading: string;
  nextPage: string;
  page: string;
  password: string;
  passwordIncorrect: string;
  passwordPrompt: string;
  passwordSubmit: string;
  previousPage: string;
  renderFailed: string;
  zoomIn: string;
  zoomOut: string;
}

interface PageView {
  canvas: HTMLCanvasElement;
  element: HTMLElement;
  page: PDFPageProxy;
  renderTask?: RenderTask;
  renderedScale?: number;
}

export interface PdfView {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  dispose(): void;
  requestPassword(onSubmit: (password: string) => void, incorrect: boolean): void;
  showOpenError(message: string): void;
  showDocument(document: PDFDocumentProxy): Promise<void>;
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function calculateFitScale(
  viewportWidth: number,
  pageWidth: number,
  paddingLeft: number,
  paddingRight: number,
) {
  return clampScale((viewportWidth - paddingLeft - paddingRight) / pageWidth);
}

function createButton(label: string, title: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

export function createPdfView(fileName: string, copy: PdfCopy): PdfView {
  const root = document.createElement("div");
  root.className = "anyfile-pdf-viewer";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-pdf-viewer { position:relative; box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:#e7e9ee; color:var(--viewer-foreground,#111827); font-family:var(--viewer-font-family,system-ui); }
    .anyfile-pdf-viewer__toolbar { z-index:2; display:grid; flex:none; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:16px; min-height:52px; padding:8px 14px; border-bottom:1px solid var(--viewer-border,#d1d5db); background:color-mix(in srgb,var(--viewer-background,#fff) 94%,transparent); box-shadow:0 1px 5px rgb(15 23 42 / 7%); }
    .anyfile-pdf-viewer__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
    .anyfile-pdf-viewer__page-state { color:#64748b; font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .anyfile-pdf-viewer__controls { display:flex; justify-self:end; align-items:center; gap:6px; }
    .anyfile-pdf-viewer button { display:inline-grid; min-width:32px; height:32px; place-items:center; border:1px solid var(--viewer-border,#d1d5db); border-radius:8px; background:var(--viewer-background,#fff); color:inherit; padding:0 9px; font:inherit; font-size:13px; cursor:pointer; }
    .anyfile-pdf-viewer button:hover { border-color:#9ca3af; background:#f8fafc; }
    .anyfile-pdf-viewer button:focus-visible { outline:2px solid var(--viewer-accent,#2563eb); outline-offset:2px; }
    .anyfile-pdf-viewer button:disabled { cursor:not-allowed; opacity:.42; }
    .anyfile-pdf-viewer__zoom { min-width:52px; color:#475569; text-align:center; font-size:12px; font-variant-numeric:tabular-nums; }
    .anyfile-pdf-viewer__viewport { min-height:0; flex:1; overflow:auto; overscroll-behavior:contain; }
    .anyfile-pdf-viewer__status { display:grid; min-height:100%; place-items:center; padding:24px; color:#64748b; font-size:13px; text-align:center; }
    .anyfile-pdf-viewer__pages { box-sizing:border-box; display:flex; width:max-content; min-width:100%; flex-direction:column; align-items:center; gap:22px; padding:28px 24px; }
    .anyfile-pdf-viewer__page { position:relative; flex:none; overflow:hidden; background:#fff; box-shadow:0 2px 8px rgb(15 23 42 / 14%),0 14px 34px rgb(15 23 42 / 10%); }
    .anyfile-pdf-viewer__page canvas { display:block; width:100%; height:100%; }
    .anyfile-pdf-viewer__page-number { position:absolute; right:8px; bottom:7px; padding:2px 6px; border-radius:5px; background:rgb(15 23 42 / 68%); color:#fff; font-size:10px; font-variant-numeric:tabular-nums; opacity:0; transition:opacity 120ms ease; }
    .anyfile-pdf-viewer__page:hover .anyfile-pdf-viewer__page-number { opacity:1; }
    .anyfile-pdf-viewer__error { margin:24px; padding:12px 14px; border:1px solid #fecaca; border-radius:9px; background:#fef2f2; color:#991b1b; font-size:13px; }
    .anyfile-pdf-viewer__sentinel { width:1px; height:1px; }
    .anyfile-pdf-viewer__password[hidden] { display:none; }
    .anyfile-pdf-viewer__password { position:absolute; inset:52px 0 0; z-index:4; display:grid; place-items:center; padding:24px; background:rgb(231 233 238 / 92%); backdrop-filter:blur(5px); }
    .anyfile-pdf-viewer__password-form { display:grid; width:min(360px,100%); gap:14px; padding:22px; border:1px solid var(--viewer-border,#d1d5db); border-radius:14px; background:var(--viewer-background,#fff); box-shadow:0 18px 50px rgb(15 23 42 / 16%); }
    .anyfile-pdf-viewer__password-title { margin:0; font-size:16px; }
    .anyfile-pdf-viewer__password-message { margin:0; color:#64748b; font-size:13px; line-height:1.5; }
    .anyfile-pdf-viewer__password-input { box-sizing:border-box; width:100%; height:38px; border:1px solid var(--viewer-border,#d1d5db); border-radius:8px; background:var(--viewer-background,#fff); color:inherit; padding:0 10px; font:inherit; }
    .anyfile-pdf-viewer__password-input:focus { outline:2px solid var(--viewer-accent,#2563eb); outline-offset:1px; }
    .anyfile-pdf-viewer__password-submit { justify-self:end; }
    @media (max-width:720px) { .anyfile-pdf-viewer__toolbar { grid-template-columns:minmax(0,1fr) auto; gap:8px; } .anyfile-pdf-viewer__page-state { display:none; } .anyfile-pdf-viewer__fit { display:none!important; } .anyfile-pdf-viewer__pages { padding:16px 12px; } }
  `;

  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-pdf-viewer__toolbar";
  const name = document.createElement("strong");
  name.className = "anyfile-pdf-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const pageState = document.createElement("span");
  pageState.className = "anyfile-pdf-viewer__page-state";
  pageState.setAttribute("aria-live", "polite");
  const controls = document.createElement("div");
  controls.className = "anyfile-pdf-viewer__controls";
  const previous = createButton("‹", copy.previousPage);
  const next = createButton("›", copy.nextPage);
  const zoomOut = createButton("−", copy.zoomOut);
  const zoomIn = createButton("+", copy.zoomIn);
  const fitWidth = createButton(copy.fitWidth, copy.fitWidth);
  fitWidth.className = "anyfile-pdf-viewer__fit";
  const zoomState = document.createElement("span");
  zoomState.className = "anyfile-pdf-viewer__zoom";
  controls.append(previous, next, zoomOut, zoomState, zoomIn, fitWidth);
  toolbar.append(name, pageState, controls);

  const viewport = document.createElement("div");
  viewport.className = "anyfile-pdf-viewer__viewport";
  const pages = document.createElement("div");
  pages.className = "anyfile-pdf-viewer__pages";
  pages.hidden = true;
  const status = document.createElement("div");
  status.className = "anyfile-pdf-viewer__status";
  status.setAttribute("role", "status");
  status.textContent = copy.loading;
  const sentinel = document.createElement("div");
  sentinel.className = "anyfile-pdf-viewer__sentinel";
  pages.append(sentinel);
  viewport.append(status, pages);

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
  const passwordSubmit = createButton(copy.passwordSubmit, copy.passwordSubmit);
  passwordSubmit.type = "submit";
  passwordSubmit.className = "anyfile-pdf-viewer__password-submit";
  passwordForm.append(passwordTitle, passwordMessage, passwordInput, passwordSubmit);
  passwordPanel.append(passwordForm);
  root.append(style, toolbar, viewport, passwordPanel);

  let documentProxy: PDFDocumentProxy | undefined;
  let scale = DEFAULT_SCALE;
  let fitMode = true;
  let disposed = false;
  let appendedPages = 0;
  let appending = false;
  let currentPage = 1;
  let resizeFrame = 0;
  const pageViews: PageView[] = [];
  const visiblePages = new Set<PageView>();
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

  const getFitScale = (page: PDFPageProxy) => {
    const baseViewport = page.getViewport({ scale: 1 });
    const pageStyles = getComputedStyle(pages);
    return calculateFitScale(
      viewport.clientWidth,
      baseViewport.width,
      Number.parseFloat(pageStyles.paddingLeft) || 0,
      Number.parseFloat(pageStyles.paddingRight) || 0,
    );
  };

  const updateToolbar = () => {
    pageState.textContent = documentProxy ? `${copy.page} ${currentPage} / ${documentProxy.numPages}` : "";
    zoomState.textContent = `${Math.round(scale * 75)}%`;
    previous.disabled = currentPage <= 1;
    next.disabled = !documentProxy || currentPage >= documentProxy.numPages;
    zoomOut.disabled = scale <= MIN_SCALE;
    zoomIn.disabled = scale >= MAX_SCALE;
  };

  const showRenderError = () => {
    if (disposed || root.querySelector(".anyfile-pdf-viewer__error")) return;
    const error = document.createElement("div");
    error.className = "anyfile-pdf-viewer__error";
    error.setAttribute("role", "alert");
    error.textContent = copy.renderFailed;
    viewport.prepend(error);
  };

  const renderPage = async (view: PageView) => {
    if (disposed || view.renderedScale === scale) return;
    view.renderTask?.cancel();
    const viewportAtScale = view.page.getViewport({ scale });
    view.element.style.width = `${viewportAtScale.width}px`;
    view.element.style.height = `${viewportAtScale.height}px`;
    const desiredRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelRatio = Math.min(
      desiredRatio,
      Math.sqrt(MAX_CANVAS_PIXELS / (viewportAtScale.width * viewportAtScale.height)),
    );
    view.canvas.width = Math.max(1, Math.floor(viewportAtScale.width * pixelRatio));
    view.canvas.height = Math.max(1, Math.floor(viewportAtScale.height * pixelRatio));
    const canvasContext = view.canvas.getContext("2d", { alpha: false });
    if (!canvasContext) throw new Error("Canvas 2D is unavailable.");
    const renderTask = view.page.render({
      canvas: view.canvas,
      canvasContext,
      viewport: viewportAtScale,
      transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    });
    view.renderTask = renderTask;
    try {
      await renderTask.promise;
      if (!disposed && view.renderTask === renderTask) view.renderedScale = scale;
    } catch (error) {
      if (!(error instanceof Error && error.name === "RenderingCancelledException")) throw error;
    } finally {
      if (view.renderTask === renderTask) view.renderTask = undefined;
    }
  };

  const pageObserver = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver((entries) => {
    let bestPage = currentPage;
    let bestVisiblePixels = 0;
    const viewportRect = viewport.getBoundingClientRect();
    for (const entry of entries) {
      const view = pageViews[Number((entry.target as HTMLElement).dataset.page) - 1];
      if (!view) continue;
      if (entry.isIntersecting) {
        visiblePages.add(view);
        void renderPage(view).catch(showRenderError);
      } else {
        visiblePages.delete(view);
      }
      const visiblePixels = Math.max(
        0,
        Math.min(entry.boundingClientRect.bottom, viewportRect.bottom)
          - Math.max(entry.boundingClientRect.top, viewportRect.top),
      );
      if (visiblePixels > bestVisiblePixels) {
        bestVisiblePixels = visiblePixels;
        bestPage = Number((entry.target as HTMLElement).dataset.page);
      }
    }
    if (bestVisiblePixels > 0) {
      currentPage = bestPage;
      updateToolbar();
    }
  }, { root: viewport, rootMargin: "600px 0px", threshold: [0, 0.25, 0.6, 1] });

  const appendPage = async (pageNumber: number) => {
    if (!documentProxy || disposed) return;
    const page = await documentProxy.getPage(pageNumber);
    if (disposed) {
      page.cleanup();
      return;
    }
    if (pageNumber === 1 && fitMode && viewport.clientWidth > 48) {
      scale = getFitScale(page);
      updateToolbar();
    }
    const initialViewport = page.getViewport({ scale });
    const element = document.createElement("section");
    element.className = "anyfile-pdf-viewer__page";
    element.dataset.page = String(pageNumber);
    element.setAttribute("aria-label", `${copy.page} ${pageNumber}`);
    element.style.width = `${initialViewport.width}px`;
    element.style.height = `${initialViewport.height}px`;
    const canvas = document.createElement("canvas");
    const number = document.createElement("span");
    number.className = "anyfile-pdf-viewer__page-number";
    number.textContent = String(pageNumber);
    element.append(canvas, number);
    pages.insertBefore(element, sentinel);
    const view = { canvas, element, page };
    pageViews.push(view);
    pageObserver?.observe(element);
    if (!pageObserver || pageNumber === 1) await renderPage(view);
  };

  const appendBatch = async () => {
    if (!documentProxy || appending || appendedPages >= documentProxy.numPages || disposed) return;
    appending = true;
    const lastPage = Math.min(documentProxy.numPages, appendedPages + PAGE_BATCH_SIZE);
    try {
      for (let pageNumber = appendedPages + 1; pageNumber <= lastPage; pageNumber += 1) {
        await appendPage(pageNumber);
        appendedPages = pageNumber;
      }
    } catch {
      showRenderError();
    } finally {
      appending = false;
    }
  };

  const sentinelObserver = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void appendBatch();
  }, { root: viewport, rootMargin: "1200px 0px" });
  sentinelObserver?.observe(sentinel);

  const setScale = (nextScale: number, nextFitMode = false) => {
    const clamped = clampScale(nextScale);
    if (clamped === scale && fitMode === nextFitMode) return;
    scale = clamped;
    fitMode = nextFitMode;
    for (const view of pageViews) {
      view.renderTask?.cancel();
      view.renderedScale = undefined;
      const nextViewport = view.page.getViewport({ scale });
      view.element.style.width = `${nextViewport.width}px`;
      view.element.style.height = `${nextViewport.height}px`;
      if (!pageObserver || visiblePages.has(view) || view === pageViews[currentPage - 1]) {
        void renderPage(view).catch(showRenderError);
      }
    }
    updateToolbar();
  };

  const fitToWidth = () => {
    const firstPage = pageViews[0]?.page;
    if (!firstPage) return;
    setScale(getFitScale(firstPage), true);
  };

  const scrollToPage = (pageNumber: number) => {
    const target = pageViews[pageNumber - 1];
    if (target) target.element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onPrevious = () => scrollToPage(Math.max(1, currentPage - 1));
  const onNext = () => scrollToPage(Math.min(documentProxy?.numPages ?? 1, currentPage + 1));
  const onZoomOut = () => setScale(scale - SCALE_STEP);
  const onZoomIn = () => setScale(scale + SCALE_STEP);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  zoomOut.addEventListener("click", onZoomOut);
  zoomIn.addEventListener("click", onZoomIn);
  fitWidth.addEventListener("click", fitToWidth);

  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (fitMode) fitToWidth();
    });
  });
  resizeObserver?.observe(viewport);
  updateToolbar();

  return {
    root,
    viewport,
    requestPassword(onSubmit, incorrect) {
      submitPassword = onSubmit;
      passwordMessage.textContent = incorrect ? copy.passwordIncorrect : copy.passwordPrompt;
      passwordPanel.hidden = false;
      passwordInput.value = "";
      passwordInput.focus();
    },
    showOpenError(message) {
      if (disposed) return;
      passwordPanel.hidden = true;
      pages.hidden = true;
      status.hidden = false;
      status.setAttribute("role", "alert");
      status.textContent = message;
    },
    async showDocument(document) {
      documentProxy = document;
      status.hidden = true;
      pages.hidden = false;
      await appendBatch();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      pageObserver?.disconnect();
      sentinelObserver?.disconnect();
      previous.removeEventListener("click", onPrevious);
      next.removeEventListener("click", onNext);
      zoomOut.removeEventListener("click", onZoomOut);
      zoomIn.removeEventListener("click", onZoomIn);
      fitWidth.removeEventListener("click", fitToWidth);
      passwordForm.removeEventListener("submit", onPasswordSubmit);
      submitPassword = undefined;
      for (const view of pageViews) {
        view.renderTask?.cancel();
        view.page.cleanup();
        view.canvas.width = 0;
        view.canvas.height = 0;
      }
      visiblePages.clear();
      root.remove();
    },
  };
}

export async function destroyPdfTask(task: PDFDocumentLoadingTask | undefined) {
  if (task && !task.destroyed) await task.destroy();
}
