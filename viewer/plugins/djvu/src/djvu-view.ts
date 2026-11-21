import { createDjvuSidebar } from "./djvu-sidebar";
import { DJVU_LIMITS } from "./limits";
import type { DjvuOpenResult, DjvuPageText } from "./types";
import { DJVU_VIEWER_STYLES, type DjvuCopy } from "./ui";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;

export interface DjvuRenderer {
  renderPage(
    pageIndex: number,
    width: number,
    height: number,
    options?: { thumbnail?: boolean; signal?: AbortSignal },
  ): Promise<{ width: number; height: number; rgba: ArrayBuffer }>;
  getPageText(pageIndex: number, signal?: AbortSignal): Promise<DjvuPageText | null>;
}

interface PageSlot {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly section: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly textLayer: HTMLElement;
  renderedScale?: number;
  textLoaded?: boolean;
  textData?: DjvuPageText | null;
  renderAbort?: AbortController;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function createButton(label: string, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

function paintRgbaToCanvas(canvas: HTMLCanvasElement, width: number, height: number, rgba: ArrayBuffer) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const pixels = new Uint8ClampedArray(rgba);
  if (typeof ImageData !== "undefined") {
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  }
}

export function createDjvuView(
  fileName: string,
  doc: DjvuOpenResult,
  copy: DjvuCopy,
  renderer: DjvuRenderer,
) {
  const root = document.createElement("div");
  root.className = "anyfile-djvu-viewer";
  const style = document.createElement("style");
  style.textContent = DJVU_VIEWER_STYLES;

  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-djvu-viewer__toolbar";

  const titleWrap = document.createElement("div");
  titleWrap.className = "anyfile-djvu-viewer__title";
  const sidebarToggle = createButton("☰", copy.sidebar);
  sidebarToggle.setAttribute("aria-pressed", "false");
  const nameEl = document.createElement("strong");
  nameEl.className = "anyfile-djvu-viewer__name";
  nameEl.textContent = fileName;
  nameEl.title = fileName;
  titleWrap.append(sidebarToggle, nameEl);

  const controls = document.createElement("div");
  controls.className = "anyfile-djvu-viewer__controls";
  const prevBtn = createButton("‹", copy.previousPage);
  const nextBtn = createButton("›", copy.nextPage);
  const pageInput = document.createElement("input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.max = String(doc.pageCount);
  pageInput.value = "1";
  pageInput.className = "anyfile-djvu-viewer__page-input";
  pageInput.setAttribute("aria-label", copy.page);
  const pageTotal = document.createElement("span");
  pageTotal.className = "anyfile-djvu-viewer__page-total";
  pageTotal.textContent = `/ ${doc.pageCount}`;

  const zoomOutBtn = createButton("−", copy.zoomOut);
  const zoomLabel = document.createElement("span");
  zoomLabel.className = "anyfile-djvu-viewer__zoom";
  const zoomInBtn = createButton("+", copy.zoomIn);
  const fitWidthBtn = createButton(copy.fitWidth, copy.fitWidth);
  const fitPageBtn = createButton(copy.fitPage, copy.fitPage);
  const textBtn = createButton(copy.textLayerOn, copy.textLayerOn);
  textBtn.setAttribute("aria-pressed", "true");

  controls.append(
    prevBtn,
    pageInput,
    pageTotal,
    nextBtn,
    zoomOutBtn,
    zoomLabel,
    zoomInBtn,
    fitWidthBtn,
    fitPageBtn,
    textBtn,
  );
  toolbar.append(titleWrap, controls);

  const body = document.createElement("div");
  body.className = "anyfile-djvu-viewer__body";

  const viewport = document.createElement("div");
  viewport.className = "anyfile-djvu-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", fileName);
  const pagesEl = document.createElement("div");
  pagesEl.className = "anyfile-djvu-viewer__pages";
  viewport.append(pagesEl);

  let disposed = false;
  let sidebarOpen = false;
  let textLayerEnabled = true;
  let currentPage = 0;
  let fitMode: "width" | "page" | "custom" = "width";
  let scale = 1;
  let resizeFrame = 0;
  let renderChain: Promise<void> = Promise.resolve();
  const visibleIndices = new Set<number>();
  const activeRenderedPages: number[] = [];

  const enqueueRender = <T>(task: () => Promise<T>): Promise<T> => {
    const next = renderChain.then(task, task);
    renderChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const pageSlots: PageSlot[] = doc.pages.map((metrics, index) => {
    const section = document.createElement("section");
    section.className = "anyfile-djvu-viewer__page";
    section.dataset.page = String(index);
    section.setAttribute("aria-label", `${copy.page} ${index + 1}`);
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;
    const textLayer = document.createElement("div");
    textLayer.className = "anyfile-djvu-viewer__text-layer";
    const badge = document.createElement("span");
    badge.className = "anyfile-djvu-viewer__page-badge";
    badge.textContent = String(index + 1);
    section.append(canvas, textLayer, badge);
    pagesEl.append(section);
    return { index, width: metrics.width, height: metrics.height, section, canvas, textLayer };
  });

  const referenceWidth = (slot: PageSlot) => Math.max(200, Math.min(1200, Math.round((slot.width * 96) / Math.max(72, doc.pages[slot.index].dpi || 300))));

  const computeFitScale = (mode: "width" | "page") => {
    const slot = pageSlots[currentPage] ?? pageSlots[0];
    if (!slot) return 1;
    const baseW = referenceWidth(slot);
    const baseH = (slot.height / slot.width) * baseW;
    const availW = Math.max(120, viewport.clientWidth - 40);
    const availH = Math.max(120, viewport.clientHeight - 40);
    if (mode === "width") return clampScale(availW / baseW);
    return clampScale(Math.min(availW / baseW, availH / baseH));
  };

  const layoutPages = () => {
    for (const slot of pageSlots) {
      const baseW = referenceWidth(slot);
      const displayW = Math.max(40, Math.round(baseW * scale));
      const displayH = Math.max(40, Math.round((slot.height / slot.width) * displayW));
      slot.section.style.width = `${displayW}px`;
      slot.section.style.height = `${displayH}px`;
    }
  };

  const evictOffscreenCanvases = (keepIndex: number) => {
    const pos = activeRenderedPages.indexOf(keepIndex);
    if (pos !== -1) activeRenderedPages.splice(pos, 1);
    activeRenderedPages.push(keepIndex);

    while (activeRenderedPages.length > DJVU_LIMITS.maxActiveCanvasPages) {
      let evictAt = -1;
      let bestScore = -1;
      for (let i = 0; i < activeRenderedPages.length; i += 1) {
        const candidate = activeRenderedPages[i];
        if (candidate === keepIndex) continue;
        const dist = Math.abs(candidate - currentPage);
        const score = (visibleIndices.has(candidate) ? 0 : 1_000_000) + dist;
        if (score > bestScore) {
          bestScore = score;
          evictAt = i;
        }
      }
      if (evictAt < 0) break;
      const [evictedIdx] = activeRenderedPages.splice(evictAt, 1);
      const slot = pageSlots[evictedIdx];
      if (slot) {
        slot.renderAbort?.abort();
        slot.canvas.width = 0;
        slot.canvas.height = 0;
        slot.renderedScale = undefined;
        slot.textLayer.replaceChildren();
      }
    }
  };

  const mountTextLayer = (slot: PageSlot) => {
    slot.textLayer.replaceChildren();
    slot.textLayer.hidden = !textLayerEnabled || !slot.textData;
    if (!textLayerEnabled || !slot.textData) return;
    const { scale: coordScale, words } = slot.textData;
    const displayW = Number.parseFloat(slot.section.style.width) || 1;
    const displayH = Number.parseFloat(slot.section.style.height) || 1;
    const fragment = document.createDocumentFragment();
    for (const word of words) {
      const span = document.createElement("span");
      span.className = "anyfile-djvu-viewer__text-word";
      span.textContent = `${word.t} `;
      span.style.left = `${(word.x / coordScale) * 100}%`;
      span.style.top = `${(word.y / coordScale) * 100}%`;
      span.style.width = `${(word.w / coordScale) * 100}%`;
      span.style.height = `${(word.h / coordScale) * 100}%`;
      const pxHeight = Math.max(8, (word.h / coordScale) * displayH);
      span.style.fontSize = `${pxHeight.toFixed(1)}px`;
      const pxWidth = Math.max(1, (word.w / coordScale) * displayW);
      if (word.t.length > 0 && pxWidth > 0) {
        span.style.letterSpacing = "0px";
      }
      fragment.append(span);
    }
    slot.textLayer.append(fragment);
  };

  const showRenderError = () => {
    if (disposed || viewport.querySelector(".anyfile-djvu-viewer__error")) return;
    const err = document.createElement("div");
    err.className = "anyfile-djvu-viewer__error";
    err.setAttribute("role", "alert");
    err.textContent = copy.renderFailed;
    viewport.prepend(err);
  };

  const renderSlot = async (slot: PageSlot) => {
    if (disposed || slot.renderedScale === scale) return;
    slot.renderAbort?.abort();
    const controller = new AbortController();
    slot.renderAbort = controller;

    const displayW = Number.parseFloat(slot.section.style.width) || referenceWidth(slot);
    const displayH = Number.parseFloat(slot.section.style.height) || Math.round((slot.height / slot.width) * displayW);
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    const maxAxisRatio = Math.sqrt(DJVU_LIMITS.maxRenderPixels / Math.max(1, displayW * displayH));
    const ratio = Math.min(dpr, maxAxisRatio);
    const targetW = Math.max(1, Math.min(slot.width, Math.floor(displayW * ratio)));
    const targetH = Math.max(1, Math.min(slot.height, Math.floor(displayH * ratio)));
    const requestedScale = scale;

    try {
      const result = await enqueueRender(() =>
        renderer.renderPage(slot.index, targetW, targetH, { signal: controller.signal }),
      );
      if (disposed || controller.signal.aborted || requestedScale !== scale) return;
      paintRgbaToCanvas(slot.canvas, result.width, result.height, result.rgba);
      slot.renderedScale = requestedScale;
      evictOffscreenCanvases(slot.index);

      if (!slot.textLoaded && textLayerEnabled) {
        slot.textLoaded = true;
        slot.textData = await enqueueRender(() => renderer.getPageText(slot.index, controller.signal));
      }
      if (!disposed && !controller.signal.aborted) mountTextLayer(slot);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showRenderError();
    } finally {
      if (slot.renderAbort === controller) slot.renderAbort = undefined;
    }
  };

  const updateToolbar = () => {
    pageInput.value = String(currentPage + 1);
    prevBtn.disabled = currentPage <= 0;
    nextBtn.disabled = currentPage >= doc.pageCount - 1;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    zoomOutBtn.disabled = scale <= MIN_SCALE;
    zoomInBtn.disabled = scale >= MAX_SCALE;
    fitWidthBtn.setAttribute("aria-pressed", String(fitMode === "width"));
    fitPageBtn.setAttribute("aria-pressed", String(fitMode === "page"));
    sidebar.setCurrentPage(currentPage);
  };

  const jumpToPage = (pageIndex: number) => {
    const clamped = Math.max(0, Math.min(doc.pageCount - 1, pageIndex));
    currentPage = clamped;
    if (!observer) {
      visibleIndices.clear();
      visibleIndices.add(clamped);
    }
    updateToolbar();
    const target = pageSlots[clamped];
    if (target) {
      target.section.scrollIntoView({ behavior: "auto", block: "start" });
      void renderSlot(target);
    }
  };

  const sidebar = createDjvuSidebar(
    doc.pages,
    doc.outline,
    copy,
    jumpToPage,
    async (pageIndex, canvas) => {
      const metrics = doc.pages[pageIndex];
      const w = 120;
      const h = Math.max(24, Math.min(240, Math.round((metrics.height / metrics.width) * w)));
      const result = await enqueueRender(() => renderer.renderPage(pageIndex, w, h, { thumbnail: true }));
      if (!disposed) paintRgbaToCanvas(canvas, result.width, result.height, result.rgba);
    },
  );

  body.append(sidebar.element, viewport);

  const footer = document.createElement("div");
  footer.className = "anyfile-djvu-viewer__footer";
  const infoSpan = document.createElement("span");
  infoSpan.textContent = `${doc.pageCount} ${copy.page === "第" ? "页" : doc.pageCount === 1 ? "page" : "pages"}`;
  const sourceLink = document.createElement("a");
  sourceLink.className = "anyfile-djvu-viewer__source";
  sourceLink.href = "/source/djvu.html";
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener";
  sourceLink.textContent = copy.sourceNotice;
  footer.append(infoSpan, sourceLink);

  root.append(style, toolbar, body, footer);

  const applyScale = (nextScale: number, nextFit: "width" | "page" | "custom") => {
    const clamped = clampScale(nextScale);
    if (clamped === scale && nextFit === fitMode) return;
    scale = clamped;
    fitMode = nextFit;
    layoutPages();
    for (const slot of pageSlots) {
      slot.renderedScale = undefined;
      if (visibleIndices.has(slot.index) || slot.index === currentPage) {
        void renderSlot(slot);
      }
    }
    updateToolbar();
  };

  const observer = typeof IntersectionObserver === "undefined"
    ? undefined
    : new IntersectionObserver(
      (entries) => {
        if (disposed) return;
        let bestPage = currentPage;
        let bestPixels = 0;
        const vpRect = viewport.getBoundingClientRect();
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.page);
          const slot = pageSlots[idx];
          if (!slot) continue;
          if (entry.isIntersecting) {
            visibleIndices.add(idx);
            void renderSlot(slot);
          } else {
            visibleIndices.delete(idx);
          }
          const overlap = Math.max(
            0,
            Math.min(entry.boundingClientRect.bottom, vpRect.bottom) - Math.max(entry.boundingClientRect.top, vpRect.top),
          );
          if (overlap > bestPixels) {
            bestPixels = overlap;
            bestPage = idx;
          }
        }
        if (bestPixels > 0 && bestPage !== currentPage) {
          currentPage = bestPage;
          updateToolbar();
        }
      },
      { root: viewport, rootMargin: "400px 0px", threshold: [0, 0.25, 0.6, 1] },
    );

  for (const slot of pageSlots) observer?.observe(slot.section);

  const onResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (disposed) return;
      if (fitMode === "width" || fitMode === "page") {
        applyScale(computeFitScale(fitMode), fitMode);
      }
    });
  };
  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(onResize);
  resizeObserver?.observe(viewport);

  sidebarToggle.onclick = () => {
    sidebarOpen = !sidebarOpen;
    sidebarToggle.setAttribute("aria-pressed", String(sidebarOpen));
    sidebar.setOpen(sidebarOpen);
  };
  prevBtn.onclick = () => jumpToPage(currentPage - 1);
  nextBtn.onclick = () => jumpToPage(currentPage + 1);
  pageInput.onchange = () => {
    const val = Number(pageInput.value);
    if (Number.isInteger(val) && val >= 1 && val <= doc.pageCount) {
      jumpToPage(val - 1);
    } else {
      pageInput.value = String(currentPage + 1);
    }
  };
  zoomOutBtn.onclick = () => applyScale(scale - SCALE_STEP, "custom");
  zoomInBtn.onclick = () => applyScale(scale + SCALE_STEP, "custom");
  fitWidthBtn.onclick = () => applyScale(computeFitScale("width"), "width");
  fitPageBtn.onclick = () => applyScale(computeFitScale("page"), "page");
  textBtn.onclick = () => {
    textLayerEnabled = !textLayerEnabled;
    textBtn.setAttribute("aria-pressed", String(textLayerEnabled));
    for (const idx of activeRenderedPages) {
      const slot = pageSlots[idx];
      if (!slot) continue;
      if (textLayerEnabled && !slot.textLoaded) {
        void renderSlot(slot);
      } else {
        mountTextLayer(slot);
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "PageDown" || event.key === "ArrowRight") {
      event.preventDefault();
      jumpToPage(currentPage + 1);
    } else if (event.key === "PageUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      jumpToPage(currentPage - 1);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      applyScale(scale + SCALE_STEP, "custom");
    } else if (event.key === "-") {
      event.preventDefault();
      applyScale(scale - SCALE_STEP, "custom");
    }
  };
  viewport.addEventListener("keydown", onKeyDown);

  if (viewport.clientWidth > 64) {
    scale = computeFitScale("width");
  }
  layoutPages();
  updateToolbar();
  if (pageSlots[0]) {
    visibleIndices.add(0);
    void renderSlot(pageSlots[0]);
  }

  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      observer?.disconnect();
      viewport.removeEventListener("keydown", onKeyDown);
      sidebar.dispose();
      for (const slot of pageSlots) {
        slot.renderAbort?.abort();
        slot.canvas.width = 0;
        slot.canvas.height = 0;
      }
      visibleIndices.clear();
      activeRenderedPages.length = 0;
      root.remove();
    },
  };
}
