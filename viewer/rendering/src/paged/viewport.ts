import {
  DEFAULT_MAX_ACTIVE_CANVAS_PAGES,
  DEFAULT_MAX_ACTIVE_THUMBNAILS,
  DEFAULT_MAX_RENDER_PIXELS,
  DEFAULT_MAX_SCALE,
  DEFAULT_MIN_SCALE,
  DEFAULT_SCALE_STEP,
  calculateFitPageScale,
  calculateFitWidthScale,
  clampScale,
  computeCanvasPixelSize,
  isAbortLikeError,
  selectEvictionCandidate,
} from "./layout";
import { createPagedSidebar, type PagedSidebarHandle } from "./sidebar";
import type {
  PageSize,
  PagedDocumentSource,
  PagedDocumentViewport,
  PagedDocumentViewportOptions,
  PagedFitMode,
  PagedOutlineItem,
  PagedTextLayer,
} from "./types";
import { PAGED_VIEWER_STYLES, createToolbarButton, pagedViewportCopy } from "./ui";

const FALLBACK_PAGE_SIZE: PageSize = { width: 816, height: 1056 };

interface PageSlot {
  readonly index: number;
  baseWidth: number;
  baseHeight: number;
  readonly section: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly textLayer?: HTMLElement;
  renderedScale?: number;
  textLoaded?: boolean;
  textData?: PagedTextLayer | null;
  renderAbort?: AbortController;
}

export function createPagedDocumentViewport(
  options: PagedDocumentViewportOptions,
): PagedDocumentViewport {
  const minScale = options.minScale ?? DEFAULT_MIN_SCALE;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;
  const scaleStep = options.scaleStep ?? DEFAULT_SCALE_STEP;
  const maxRenderPixels = options.maxRenderPixels ?? DEFAULT_MAX_RENDER_PIXELS;
  const maxActiveCanvasPages = options.maxActiveCanvasPages ?? DEFAULT_MAX_ACTIVE_CANVAS_PAGES;
  const maxActiveThumbnails = options.maxActiveThumbnails ?? DEFAULT_MAX_ACTIVE_THUMBNAILS;
  const copy = { ...pagedViewportCopy(options.locale), ...options.copy };

  const root = document.createElement("div");
  root.className = options.className
    ? `anyfile-paged-viewer ${options.className}`
    : "anyfile-paged-viewer";
  const style = document.createElement("style");
  style.textContent = PAGED_VIEWER_STYLES;

  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-paged-viewer__toolbar";

  const titleWrap = document.createElement("div");
  titleWrap.className = "anyfile-paged-viewer__title";
  const sidebarToggle = createToolbarButton("☰", copy.sidebar);
  sidebarToggle.setAttribute("aria-pressed", "false");
  sidebarToggle.hidden = true;
  const nameEl = document.createElement("strong");
  nameEl.className = "anyfile-paged-viewer__name";
  nameEl.textContent = options.fileName;
  nameEl.title = options.fileName;
  titleWrap.append(sidebarToggle, nameEl);

  const controls = document.createElement("div");
  controls.className = "anyfile-paged-viewer__controls";
  const prevBtn = createToolbarButton("‹", copy.previousPage);
  const nextBtn = createToolbarButton("›", copy.nextPage);
  const pageInput = document.createElement("input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.max = "1";
  pageInput.value = "1";
  pageInput.className = "anyfile-paged-viewer__page-input";
  pageInput.setAttribute("aria-label", copy.page);
  const pageTotal = document.createElement("span");
  pageTotal.className = "anyfile-paged-viewer__page-total";
  pageTotal.textContent = "/ 0";

  const zoomOutBtn = createToolbarButton("−", copy.zoomOut);
  const zoomLabel = document.createElement("span");
  zoomLabel.className = "anyfile-paged-viewer__zoom";
  const zoomInBtn = createToolbarButton("+", copy.zoomIn);
  const fitWidthBtn = createToolbarButton(copy.fitWidth, copy.fitWidth);
  const fitPageBtn = createToolbarButton(copy.fitPage, copy.fitPage);
  const textBtn = createToolbarButton(copy.textLayerOn, copy.textLayerOn);
  textBtn.setAttribute("aria-pressed", "true");
  textBtn.hidden = true;

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
  body.className = "anyfile-paged-viewer__body";

  const viewport = document.createElement("div");
  viewport.className = "anyfile-paged-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", options.fileName);

  const statusEl = document.createElement("div");
  statusEl.className = "anyfile-paged-viewer__status";
  statusEl.setAttribute("role", "status");
  if (options.initialStatus) {
    statusEl.textContent = options.initialStatus;
  } else {
    statusEl.hidden = true;
  }

  const pagesEl = document.createElement("div");
  pagesEl.className = "anyfile-paged-viewer__pages";
  pagesEl.hidden = true;
  viewport.append(statusEl, pagesEl);
  body.append(viewport);

  const footer = document.createElement("div");
  footer.className = "anyfile-paged-viewer__footer";
  const infoSpan = document.createElement("span");
  footer.append(infoSpan);
  if (options.footerLink) {
    const sourceLink = document.createElement("a");
    sourceLink.className = "anyfile-paged-viewer__source";
    sourceLink.href = options.footerLink.href;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener";
    sourceLink.textContent = options.footerLink.label;
    footer.append(sourceLink);
  }
  footer.hidden = !options.footerLink;

  root.append(style, toolbar, body, footer);

  let disposed = false;
  let sourceGeneration = 0;
  let activeSource: PagedDocumentSource | undefined;
  let sidebar: PagedSidebarHandle | undefined;
  let sidebarOpen = false;
  let textLayerEnabled = true;
  let currentPage = 0;
  let fitMode: PagedFitMode = options.initialFitMode ?? "width";
  let scale = clampScale(options.initialScale ?? 1, minScale, maxScale);
  let resizeFrame = 0;
  let pageSlots: PageSlot[] = [];
  const visibleIndices = new Set<number>();
  const activeRenderedPages: number[] = [];

  const getInitialPageSize = (source: PagedDocumentSource, index: number): PageSize => {
    const known = source.pages?.[index] ?? source.defaultPageSize ?? FALLBACK_PAGE_SIZE;
    return {
      width: Math.max(1, known.width),
      height: Math.max(1, known.height),
    };
  };

  const applySlotLayout = (slot: PageSlot) => {
    const displayW = Math.max(40, Math.round(slot.baseWidth * scale));
    const displayH = Math.max(40, Math.round((slot.baseHeight / slot.baseWidth) * displayW));
    slot.section.style.width = `${displayW}px`;
    slot.section.style.height = `${displayH}px`;
  };

  const layoutPages = () => {
    for (const slot of pageSlots) applySlotLayout(slot);
  };

  const computeFitScale = (mode: "width" | "page"): number => {
    const slot = pageSlots[currentPage] ?? pageSlots[0];
    if (!slot) return scale;
    const styles = typeof getComputedStyle === "function" ? getComputedStyle(pagesEl) : undefined;
    const padX = (Number.parseFloat(styles?.paddingLeft ?? "") || 16)
      + (Number.parseFloat(styles?.paddingRight ?? "") || 16);
    const padY = (Number.parseFloat(styles?.paddingTop ?? "") || 20)
      + (Number.parseFloat(styles?.paddingBottom ?? "") || 20);
    if (mode === "width") {
      return calculateFitWidthScale(viewport.clientWidth, slot.baseWidth, padX, minScale, maxScale);
    }
    return calculateFitPageScale(
      viewport.clientWidth,
      viewport.clientHeight,
      slot.baseWidth,
      slot.baseHeight,
      padX,
      padY,
      minScale,
      maxScale,
    );
  };

  const updateToolbar = () => {
    const count = activeSource?.pageCount ?? 0;
    const hasPages = count > 0;
    pageInput.max = String(Math.max(1, count));
    pageInput.value = hasPages ? String(currentPage + 1) : "";
    pageInput.disabled = !hasPages;
    pageTotal.textContent = `/ ${count}`;
    prevBtn.disabled = !hasPages || currentPage <= 0;
    nextBtn.disabled = !hasPages || currentPage >= count - 1;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    zoomOutBtn.disabled = !hasPages || scale <= minScale;
    zoomInBtn.disabled = !hasPages || scale >= maxScale;
    fitWidthBtn.disabled = !hasPages;
    fitPageBtn.disabled = !hasPages;
    fitWidthBtn.setAttribute("aria-pressed", String(hasPages && fitMode === "width"));
    fitPageBtn.setAttribute("aria-pressed", String(hasPages && fitMode === "page"));
    sidebarToggle.hidden = !sidebar?.hasContent();
    textBtn.hidden = !activeSource?.getPageText;
    infoSpan.textContent = hasPages ? copy.pageCountSuffix(count) : "";
    sidebar?.setCurrentPage(currentPage);
  };

  const evictOffscreenCanvases = (keepIndex: number) => {
    const pos = activeRenderedPages.indexOf(keepIndex);
    if (pos !== -1) activeRenderedPages.splice(pos, 1);
    activeRenderedPages.push(keepIndex);

    while (activeRenderedPages.length > maxActiveCanvasPages) {
      const evictAt = selectEvictionCandidate(activeRenderedPages, keepIndex, currentPage, visibleIndices);
      if (evictAt < 0) break;
      const [evictedIdx] = activeRenderedPages.splice(evictAt, 1);
      const slot = pageSlots[evictedIdx];
      if (slot) {
        slot.renderAbort?.abort();
        slot.canvas.width = 0;
        slot.canvas.height = 0;
        slot.renderedScale = undefined;
        slot.textLayer?.replaceChildren();
        activeSource?.onEvictPage?.(evictedIdx);
      }
    }
  };

  const mountTextLayer = (slot: PageSlot) => {
    if (!slot.textLayer) return;
    slot.textLayer.replaceChildren();
    slot.textLayer.hidden = !textLayerEnabled || !slot.textData;
    if (!textLayerEnabled || !slot.textData) return;
    const { scale: coordScale, words } = slot.textData;
    const displayW = Number.parseFloat(slot.section.style.width) || 1;
    const displayH = Number.parseFloat(slot.section.style.height) || 1;
    const fragment = document.createDocumentFragment();
    for (const word of words) {
      const span = document.createElement("span");
      span.className = "anyfile-paged-viewer__text-word";
      span.textContent = `${word.text} `;
      span.style.left = `${(word.x / coordScale) * 100}%`;
      span.style.top = `${(word.y / coordScale) * 100}%`;
      span.style.width = `${(word.w / coordScale) * 100}%`;
      span.style.height = `${(word.h / coordScale) * 100}%`;
      const pxHeight = Math.max(8, (word.h / coordScale) * displayH);
      span.style.fontSize = `${pxHeight.toFixed(1)}px`;
      const pxWidth = Math.max(1, (word.w / coordScale) * displayW);
      if (word.text.length > 0 && pxWidth > 0) {
        span.style.letterSpacing = "0px";
      }
      fragment.append(span);
    }
    slot.textLayer.append(fragment);
  };

  const showRenderError = () => {
    if (disposed || viewport.querySelector(".anyfile-paged-viewer__error")) return;
    const err = document.createElement("div");
    err.className = "anyfile-paged-viewer__error";
    err.setAttribute("role", "alert");
    err.textContent = copy.renderFailed;
    viewport.prepend(err);
  };

  const renderSlot = async (slot: PageSlot) => {
    const source = activeSource;
    if (disposed || !source || slot.renderedScale === scale) return;
    const generation = sourceGeneration;
    slot.renderAbort?.abort();
    const controller = new AbortController();
    slot.renderAbort = controller;

    const displayWidth = Number.parseFloat(slot.section.style.width) || slot.baseWidth;
    const displayHeight = Number.parseFloat(slot.section.style.height)
      || Math.round((slot.baseHeight / slot.baseWidth) * displayWidth);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const { pixelRatio } = computeCanvasPixelSize(displayWidth, displayHeight, dpr, maxRenderPixels);
    const requestedScale = scale;

    try {
      const resolvedSize = await source.renderPage(slot.index, slot.canvas, {
        displayWidth,
        displayHeight,
        scale: requestedScale,
        pixelRatio,
        maxPixels: maxRenderPixels,
        signal: controller.signal,
      });
      if (disposed || controller.signal.aborted || generation !== sourceGeneration || requestedScale !== scale) {
        return;
      }
      if (resolvedSize && resolvedSize.width > 0 && resolvedSize.height > 0) {
        if (resolvedSize.width !== slot.baseWidth || resolvedSize.height !== slot.baseHeight) {
          slot.baseWidth = resolvedSize.width;
          slot.baseHeight = resolvedSize.height;
          applySlotLayout(slot);
        }
      }
      slot.renderedScale = requestedScale;
      evictOffscreenCanvases(slot.index);

      if (source.getPageText && textLayerEnabled) {
        if (!slot.textLoaded) {
          const textData = await source.getPageText(slot.index, controller.signal);
          if (disposed || controller.signal.aborted || generation !== sourceGeneration) return;
          slot.textData = textData;
          slot.textLoaded = true;
        }
        if (!disposed && !controller.signal.aborted && generation === sourceGeneration) {
          mountTextLayer(slot);
        }
      }
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) return;
      showRenderError();
    } finally {
      if (slot.renderAbort === controller) slot.renderAbort = undefined;
    }
  };

  const pageObserver = typeof IntersectionObserver === "undefined"
    ? undefined
    : new IntersectionObserver(
      (entries) => {
        if (disposed || !activeSource) return;
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
            Math.min(entry.boundingClientRect.bottom, vpRect.bottom)
              - Math.max(entry.boundingClientRect.top, vpRect.top),
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

  const jumpToPage = (pageIndex: number) => {
    if (!activeSource || activeSource.pageCount <= 0) return;
    const clamped = Math.max(0, Math.min(activeSource.pageCount - 1, pageIndex));
    currentPage = clamped;
    if (!pageObserver) {
      visibleIndices.clear();
      visibleIndices.add(clamped);
    }
    updateToolbar();
    const target = pageSlots[clamped];
    if (target) {
      target.section.scrollIntoView?.({ behavior: "auto", block: "start" });
      void renderSlot(target);
    }
  };

  const applyScale = (nextScale: number, nextFit: PagedFitMode) => {
    if (!activeSource) return;
    const clamped = clampScale(nextScale, minScale, maxScale);
    if (clamped === scale && nextFit === fitMode) return;
    scale = clamped;
    fitMode = nextFit;
    layoutPages();
    for (const slot of pageSlots) {
      slot.renderAbort?.abort();
      slot.renderedScale = undefined;
      if (visibleIndices.has(slot.index) || slot.index === currentPage) {
        void renderSlot(slot);
      }
    }
    updateToolbar();
  };

  const teardownSource = () => {
    sourceGeneration += 1;
    pageObserver?.disconnect();
    for (const slot of pageSlots) {
      slot.renderAbort?.abort();
      slot.canvas.width = 0;
      slot.canvas.height = 0;
    }
    pageSlots = [];
    pagesEl.replaceChildren();
    visibleIndices.clear();
    activeRenderedPages.length = 0;
    sidebar?.dispose();
    sidebar?.element.remove();
    sidebar = undefined;
    sidebarOpen = false;
    sidebarToggle.setAttribute("aria-pressed", "false");
    const prevSource = activeSource;
    activeSource = undefined;
    prevSource?.dispose?.();
  };

  const setSource = (source: PagedDocumentSource) => {
    if (disposed) {
      source.dispose?.();
      return;
    }
    teardownSource();
    activeSource = source;
    currentPage = 0;
    statusEl.hidden = true;
    pagesEl.hidden = false;
    viewport.querySelector(".anyfile-paged-viewer__error")?.remove();

    const hasText = typeof source.getPageText === "function";
    pageSlots = Array.from({ length: source.pageCount }, (_, index) => {
      const size = getInitialPageSize(source, index);
      const section = document.createElement("section");
      section.className = "anyfile-paged-viewer__page";
      section.dataset.page = String(index);
      section.setAttribute("aria-label", `${copy.page} ${index + 1}`);
      const canvas = document.createElement("canvas");
      canvas.width = 0;
      canvas.height = 0;
      let textLayer: HTMLElement | undefined;
      if (hasText) {
        textLayer = document.createElement("div");
        textLayer.className = "anyfile-paged-viewer__text-layer";
      }
      const badge = document.createElement("span");
      badge.className = "anyfile-paged-viewer__page-badge";
      badge.textContent = String(index + 1);
      if (textLayer) section.append(canvas, textLayer, badge);
      else section.append(canvas, badge);
      pagesEl.append(section);
      return {
        index,
        baseWidth: size.width,
        baseHeight: size.height,
        section,
        canvas,
        textLayer,
      };
    });

    sidebar = createPagedSidebar({
      pageCount: source.pageCount,
      getPageSize: (pageIndex) => {
        const slot = pageSlots[pageIndex];
        return slot ? { width: slot.baseWidth, height: slot.baseHeight } : FALLBACK_PAGE_SIZE;
      },
      outline: source.outline ?? [],
      copy,
      maxActiveThumbnails,
      onSelectPage: jumpToPage,
      renderThumbnail: source.renderThumbnail
        ? (pageIndex, canvas, width, height, signal) =>
          source.renderThumbnail!(pageIndex, canvas, width, height, signal)
        : undefined,
    });
    body.prepend(sidebar.element);

    if (viewport.clientWidth > 64 && (fitMode === "width" || fitMode === "page")) {
      scale = computeFitScale(fitMode);
    }
    layoutPages();
    for (const slot of pageSlots) pageObserver?.observe(slot.section);
    updateToolbar();

    if (pageSlots[0]) {
      void renderSlot(pageSlots[0]);
    }
  };

  const setOutline = (outline: readonly PagedOutlineItem[]) => {
    if (disposed || !sidebar) return;
    sidebar.setOutline(outline);
    updateToolbar();
  };

  const showStatus = (message: string, statusOptions?: { readonly isError?: boolean }) => {
    if (disposed) return;
    pagesEl.hidden = true;
    statusEl.hidden = false;
    statusEl.setAttribute("role", statusOptions?.isError ? "alert" : "status");
    statusEl.textContent = message;
  };

  const onResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (disposed || !activeSource) return;
      if (fitMode === "width" || fitMode === "page") {
        applyScale(computeFitScale(fitMode), fitMode);
      }
    });
  };
  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(onResize);
  resizeObserver?.observe(viewport);

  sidebarToggle.onclick = () => {
    if (!sidebar) return;
    sidebarOpen = !sidebarOpen;
    sidebarToggle.setAttribute("aria-pressed", String(sidebarOpen));
    sidebar.setOpen(sidebarOpen);
  };
  prevBtn.onclick = () => jumpToPage(currentPage - 1);
  nextBtn.onclick = () => jumpToPage(currentPage + 1);
  pageInput.onchange = () => {
    const count = activeSource?.pageCount ?? 0;
    const val = Number(pageInput.value);
    if (Number.isInteger(val) && val >= 1 && val <= count) {
      jumpToPage(val - 1);
    } else if (count > 0) {
      pageInput.value = String(currentPage + 1);
    }
  };
  zoomOutBtn.onclick = () => applyScale(scale - scaleStep, "custom");
  zoomInBtn.onclick = () => applyScale(scale + scaleStep, "custom");
  fitWidthBtn.onclick = () => applyScale(computeFitScale("width"), "width");
  fitPageBtn.onclick = () => applyScale(computeFitScale("page"), "page");
  textBtn.onclick = () => {
    textLayerEnabled = !textLayerEnabled;
    textBtn.setAttribute("aria-pressed", String(textLayerEnabled));
    for (const idx of activeRenderedPages) {
      const slot = pageSlots[idx];
      if (!slot) continue;
      if (textLayerEnabled && !slot.textLoaded) {
        slot.renderedScale = undefined;
        void renderSlot(slot);
      } else {
        mountTextLayer(slot);
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!activeSource || event.target instanceof HTMLInputElement) return;
    if (event.key === "PageDown" || event.key === "ArrowRight") {
      event.preventDefault();
      jumpToPage(currentPage + 1);
    } else if (event.key === "PageUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      jumpToPage(currentPage - 1);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      applyScale(scale + scaleStep, "custom");
    } else if (event.key === "-") {
      event.preventDefault();
      applyScale(scale - scaleStep, "custom");
    }
  };
  viewport.addEventListener("keydown", onKeyDown);

  updateToolbar();
  if (options.source) {
    setSource(options.source);
  }

  return {
    root,
    viewport,
    setSource,
    setOutline,
    showStatus,
    jumpToPage,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      viewport.removeEventListener("keydown", onKeyDown);
      teardownSource();
      root.remove();
    },
  };
}
