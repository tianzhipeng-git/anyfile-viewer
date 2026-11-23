import type { PageSize, PagedOutlineItem, PagedViewportCopy } from "./types";

export interface PagedSidebarOptions {
  readonly pageCount: number;
  readonly getPageSize: (pageIndex: number) => PageSize;
  readonly outline: readonly PagedOutlineItem[];
  readonly copy: PagedViewportCopy;
  readonly maxActiveThumbnails: number;
  readonly onSelectPage: (pageIndex: number) => void;
  readonly renderThumbnail?: (
    pageIndex: number,
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    signal: AbortSignal,
  ) => Promise<void>;
}

export interface PagedSidebarHandle {
  readonly element: HTMLElement;
  hasContent(): boolean;
  setOpen(open: boolean): void;
  setOutline(outline: readonly PagedOutlineItem[]): void;
  setCurrentPage(pageIndex: number): void;
  dispose(): void;
}

interface ThumbSlot {
  readonly button: HTMLButtonElement;
  readonly canvas: HTMLCanvasElement;
  readonly targetWidth: number;
  readonly targetHeight: number;
  rendered: boolean;
  rendering: boolean;
  abort?: AbortController;
}

function buildOutlineList(
  items: readonly PagedOutlineItem[],
  onSelectPage: (pageIndex: number) => void,
  buttons: Array<{ readonly button: HTMLButtonElement; readonly page: number }>,
): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "anyfile-paged-viewer__outline-list";
  for (const item of items) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "anyfile-paged-viewer__outline-btn";
    button.textContent = item.title || "…";
    if (item.page >= 0) {
      button.onclick = () => onSelectPage(item.page);
      buttons.push({ button, page: item.page });
    } else {
      button.disabled = true;
    }
    li.append(button);
    if (item.children.length > 0) {
      li.append(buildOutlineList(item.children, onSelectPage, buttons));
    }
    ul.append(li);
  }
  return ul;
}

export function createPagedSidebar(options: PagedSidebarOptions): PagedSidebarHandle {
  const {
    pageCount,
    getPageSize,
    copy,
    maxActiveThumbnails,
    onSelectPage,
    renderThumbnail,
  } = options;

  const hasThumbnails = typeof renderThumbnail === "function";
  let outlineItems: readonly PagedOutlineItem[] = options.outline;
  let outlineButtons: Array<{ readonly button: HTMLButtonElement; readonly page: number }> = [];
  let disposed = false;
  let currentPage = 0;
  let activeTab: "outline" | "thumbs" = outlineItems.length > 0 || !hasThumbnails ? "outline" : "thumbs";
  let thumbSlots: ThumbSlot[] | undefined;
  let thumbObserver: IntersectionObserver | undefined;
  const activeThumbs: number[] = [];

  const sidebar = document.createElement("aside");
  sidebar.className = "anyfile-paged-viewer__sidebar";
  sidebar.setAttribute("aria-label", copy.sidebar);
  sidebar.hidden = true;

  const tabs = document.createElement("div");
  tabs.className = "anyfile-paged-viewer__tabs";
  tabs.setAttribute("role", "tablist");
  const outlineTab = document.createElement("button");
  outlineTab.type = "button";
  outlineTab.setAttribute("role", "tab");
  outlineTab.textContent = copy.outline;
  const thumbsTab = document.createElement("button");
  thumbsTab.type = "button";
  thumbsTab.setAttribute("role", "tab");
  thumbsTab.textContent = copy.thumbnails;
  tabs.append(outlineTab, thumbsTab);

  const outlinePanel = document.createElement("div");
  outlinePanel.className = "anyfile-paged-viewer__panel";

  const thumbsPanel = document.createElement("div");
  thumbsPanel.className = "anyfile-paged-viewer__panel";
  const thumbsGrid = document.createElement("div");
  thumbsGrid.className = "anyfile-paged-viewer__thumbs";
  thumbsPanel.append(thumbsGrid);

  const renderOutlinePanel = () => {
    outlineButtons = [];
    outlinePanel.replaceChildren();
    if (outlineItems.length > 0) {
      outlinePanel.append(buildOutlineList(outlineItems, onSelectPage, outlineButtons));
    } else {
      const empty = document.createElement("p");
      empty.className = "anyfile-paged-viewer__empty";
      empty.textContent = copy.noOutline;
      outlinePanel.append(empty);
    }
    syncCurrentPage();
  };

  const evictThumbnailIfNeeded = (keepIndex: number) => {
    const existing = activeThumbs.indexOf(keepIndex);
    if (existing !== -1) activeThumbs.splice(existing, 1);
    activeThumbs.push(keepIndex);
    while (activeThumbs.length > maxActiveThumbnails) {
      const oldest = activeThumbs.shift();
      if (oldest === undefined || oldest === keepIndex) continue;
      const slot = thumbSlots?.[oldest];
      if (slot) {
        slot.abort?.abort();
        slot.canvas.width = 0;
        slot.canvas.height = 0;
        slot.rendered = false;
      }
    }
  };

  const ensureThumbnailsMounted = () => {
    if (!hasThumbnails || !renderThumbnail || thumbSlots || disposed) return;
    thumbSlots = Array.from({ length: pageCount }, (_, pageIndex) => {
      const metrics = getPageSize(pageIndex);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "anyfile-paged-viewer__thumb";
      button.dataset.page = String(pageIndex);
      button.dataset.active = String(pageIndex === currentPage);
      button.setAttribute("aria-label", `${copy.page} ${pageIndex + 1}`);

      const canvas = document.createElement("canvas");
      canvas.width = 0;
      canvas.height = 0;
      const thumbW = 92;
      const ratio = metrics.width > 0 ? metrics.height / metrics.width : 1.3;
      const thumbH = Math.max(24, Math.min(180, Math.round(ratio * thumbW)));
      canvas.style.width = `${thumbW}px`;
      canvas.style.height = `${thumbH}px`;
      const targetWidth = 120;
      const targetHeight = Math.max(24, Math.min(240, Math.round(ratio * targetWidth)));

      const label = document.createElement("span");
      label.textContent = String(pageIndex + 1);
      button.append(canvas, label);
      button.onclick = () => onSelectPage(pageIndex);
      thumbsGrid.append(button);
      return { button, canvas, targetWidth, targetHeight, rendered: false, rendering: false };
    });

    if (typeof IntersectionObserver !== "undefined") {
      thumbObserver = new IntersectionObserver(
        (entries) => {
          if (disposed || sidebar.hidden || activeTab !== "thumbs" || !thumbSlots) return;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const idx = Number((entry.target as HTMLElement).dataset.page);
            const slot = thumbSlots[idx];
            if (!slot || slot.rendered || slot.rendering) continue;
            slot.rendering = true;
            const controller = new AbortController();
            slot.abort = controller;
            void renderThumbnail(idx, slot.canvas, slot.targetWidth, slot.targetHeight, controller.signal)
              .then(() => {
                if (disposed || controller.signal.aborted) return;
                slot.rendered = true;
                evictThumbnailIfNeeded(idx);
              })
              .catch(() => {
                // Ignore cancelled or failed thumbnail renders.
              })
              .finally(() => {
                if (slot.abort === controller) slot.abort = undefined;
                slot.rendering = false;
              });
          }
        },
        { root: thumbsPanel, rootMargin: "200px 0px" },
      );
      for (const slot of thumbSlots) thumbObserver.observe(slot.button);
    }
  };

  const syncTabs = () => {
    tabs.hidden = !hasThumbnails;
    outlineTab.setAttribute("aria-selected", String(activeTab === "outline"));
    thumbsTab.setAttribute("aria-selected", String(activeTab === "thumbs"));
    outlinePanel.hidden = activeTab !== "outline";
    thumbsPanel.hidden = !hasThumbnails || activeTab !== "thumbs";
    if (!sidebar.hidden && activeTab === "thumbs") {
      ensureThumbnailsMounted();
    }
  };

  const syncCurrentPage = () => {
    for (const item of outlineButtons) {
      if (item.page === currentPage) item.button.setAttribute("aria-current", "page");
      else item.button.removeAttribute("aria-current");
    }
    if (thumbSlots) {
      for (let i = 0; i < thumbSlots.length; i += 1) {
        thumbSlots[i].button.dataset.active = String(i === currentPage);
      }
    }
  };

  outlineTab.onclick = () => {
    activeTab = "outline";
    syncTabs();
  };
  thumbsTab.onclick = () => {
    activeTab = "thumbs";
    syncTabs();
  };

  renderOutlinePanel();
  syncTabs();
  sidebar.append(tabs, outlinePanel, thumbsPanel);

  return {
    element: sidebar,
    hasContent() {
      return hasThumbnails || outlineItems.length > 0;
    },
    setOpen(open: boolean) {
      sidebar.hidden = !open;
      if (open && activeTab === "thumbs") {
        ensureThumbnailsMounted();
      }
    },
    setOutline(outline: readonly PagedOutlineItem[]) {
      if (disposed) return;
      outlineItems = outline;
      if (outline.length > 0 && sidebar.hidden) {
        activeTab = "outline";
      }
      renderOutlinePanel();
      syncTabs();
    },
    setCurrentPage(pageIndex: number) {
      currentPage = pageIndex;
      syncCurrentPage();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      thumbObserver?.disconnect();
      if (thumbSlots) {
        for (const slot of thumbSlots) {
          slot.abort?.abort();
          slot.canvas.width = 0;
          slot.canvas.height = 0;
        }
      }
      activeThumbs.length = 0;
    },
  };
}
