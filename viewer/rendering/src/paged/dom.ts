import type { PagedFooterLink, PagedTextLayer, PagedViewportCopy } from "./types";
import { PAGED_VIEWER_STYLES, createToolbarButton } from "./ui";

export interface PagedViewportShell {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  readonly viewport: HTMLElement;
  readonly statusEl: HTMLElement;
  readonly pagesEl: HTMLElement;
  readonly infoSpan: HTMLElement;
  readonly sidebarToggle: HTMLButtonElement;
  readonly prevBtn: HTMLButtonElement;
  readonly nextBtn: HTMLButtonElement;
  readonly pageInput: HTMLInputElement;
  readonly pageTotal: HTMLElement;
  readonly zoomOutBtn: HTMLButtonElement;
  readonly zoomLabel: HTMLElement;
  readonly zoomInBtn: HTMLButtonElement;
  readonly fitWidthBtn: HTMLButtonElement;
  readonly fitPageBtn: HTMLButtonElement;
  readonly textBtn: HTMLButtonElement;
}

export function createPagedViewportShell(
  fileName: string,
  copy: PagedViewportCopy,
  options: {
    readonly className?: string;
    readonly initialStatus?: string;
    readonly footerLink?: PagedFooterLink;
  },
): PagedViewportShell {
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
  nameEl.textContent = fileName;
  nameEl.title = fileName;
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
  viewport.setAttribute("aria-label", fileName);

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
  return {
    root,
    body,
    viewport,
    statusEl,
    pagesEl,
    infoSpan,
    sidebarToggle,
    prevBtn,
    nextBtn,
    pageInput,
    pageTotal,
    zoomOutBtn,
    zoomLabel,
    zoomInBtn,
    fitWidthBtn,
    fitPageBtn,
    textBtn,
  };
}

export function renderPagedTextLayer(
  textLayer: HTMLElement,
  section: HTMLElement,
  textData: PagedTextLayer | null | undefined,
  enabled: boolean,
): void {
  textLayer.replaceChildren();
  textLayer.hidden = !enabled || !textData;
  if (!enabled || !textData) return;
  const { scale: coordScale, words } = textData;
  const displayW = Number.parseFloat(section.style.width) || 1;
  const displayH = Number.parseFloat(section.style.height) || 1;
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
  textLayer.append(fragment);
}
