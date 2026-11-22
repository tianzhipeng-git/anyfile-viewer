import { DJVU_LIMITS } from "./limits";
import type { DjvuOutlineItem, DjvuPageMetrics } from "./types";
import type { DjvuCopy } from "./ui";

export interface DjvuSidebarHandle {
  readonly element: HTMLElement;
  setOpen(open: boolean): void;
  setCurrentPage(pageIndex: number): void;
  dispose(): void;
}

function buildOutlineList(
  items: readonly DjvuOutlineItem[],
  onSelectPage: (pageIndex: number) => void,
): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "anyfile-djvu-viewer__outline-list";
  for (const item of items) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "anyfile-djvu-viewer__outline-btn";
    button.textContent = item.title || "…";
    if (item.page >= 0) {
      button.onclick = () => onSelectPage(item.page);
    } else {
      button.disabled = true;
    }
    li.append(button);
    if (item.children.length > 0) {
      li.append(buildOutlineList(item.children, onSelectPage));
    }
    ul.append(li);
  }
  return ul;
}

export function createDjvuSidebar(
  pages: readonly DjvuPageMetrics[],
  outline: readonly DjvuOutlineItem[],
  copy: DjvuCopy,
  onSelectPage: (pageIndex: number) => void,
  renderThumbnail: (pageIndex: number, canvas: HTMLCanvasElement) => Promise<void>,
): DjvuSidebarHandle {
  const sidebar = document.createElement("aside");
  sidebar.className = "anyfile-djvu-viewer__sidebar";
  sidebar.hidden = true;

  const tabs = document.createElement("div");
  tabs.className = "anyfile-djvu-viewer__tabs";
  const outlineTab = document.createElement("button");
  outlineTab.type = "button";
  outlineTab.textContent = copy.outline;
  const thumbsTab = document.createElement("button");
  thumbsTab.type = "button";
  thumbsTab.textContent = copy.thumbnails;
  tabs.append(outlineTab, thumbsTab);

  const outlinePanel = document.createElement("div");
  outlinePanel.className = "anyfile-djvu-viewer__panel";
  if (outline.length > 0) {
    outlinePanel.append(buildOutlineList(outline, onSelectPage));
  } else {
    const empty = document.createElement("p");
    empty.textContent = copy.noOutline;
    empty.style.cssText = "margin:8px;font-size:12px;color:var(--viewer-muted,color-mix(in srgb,var(--viewer-foreground,#111) 62%,transparent))";
    outlinePanel.append(empty);
  }

  const thumbsPanel = document.createElement("div");
  thumbsPanel.className = "anyfile-djvu-viewer__panel";
  const thumbsGrid = document.createElement("div");
  thumbsGrid.className = "anyfile-djvu-viewer__thumbs";
  thumbsPanel.append(thumbsGrid);

  const activeThumbs: number[] = [];
  const thumbSlots = pages.map((metrics, pageIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "anyfile-djvu-viewer__thumb";
    button.dataset.page = String(pageIndex);
    button.setAttribute("aria-label", `${copy.page} ${pageIndex + 1}`);
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;
    const thumbW = 92;
    const thumbH = Math.max(24, Math.min(180, Math.round((metrics.height / metrics.width) * thumbW)));
    canvas.style.width = `${thumbW}px`;
    canvas.style.height = `${thumbH}px`;
    const label = document.createElement("span");
    label.textContent = String(pageIndex + 1);
    button.append(canvas, label);
    button.onclick = () => onSelectPage(pageIndex);
    thumbsGrid.append(button);
    return { button, canvas, rendered: false, rendering: false };
  });

  let disposed = false;
  let activeTab: "outline" | "thumbs" = outline.length > 0 ? "outline" : "thumbs";

  const evictThumbnailIfNeeded = (keepIndex: number) => {
    const existing = activeThumbs.indexOf(keepIndex);
    if (existing !== -1) activeThumbs.splice(existing, 1);
    activeThumbs.push(keepIndex);
    while (activeThumbs.length > DJVU_LIMITS.maxActiveThumbnails) {
      const oldest = activeThumbs.shift();
      if (oldest === undefined || oldest === keepIndex) continue;
      const slot = thumbSlots[oldest];
      if (slot) {
        slot.canvas.width = 0;
        slot.canvas.height = 0;
        slot.rendered = false;
      }
    }
  };

  const thumbObserver = typeof IntersectionObserver === "undefined"
    ? undefined
    : new IntersectionObserver(
      (entries) => {
        if (disposed || sidebar.hidden || activeTab !== "thumbs") return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.page);
          const slot = thumbSlots[idx];
          if (!slot || slot.rendered || slot.rendering) continue;
          slot.rendering = true;
          void renderThumbnail(idx, slot.canvas)
            .then(() => {
              if (disposed) return;
              slot.rendered = true;
              evictThumbnailIfNeeded(idx);
            })
            .catch(() => {
              // Ignore cancelled/failed thumbnail renders.
            })
            .finally(() => {
              slot.rendering = false;
            });
        }
      },
      { root: thumbsPanel, rootMargin: "200px 0px" },
    );

  for (const slot of thumbSlots) thumbObserver?.observe(slot.button);

  const syncTabs = () => {
    outlineTab.setAttribute("aria-pressed", String(activeTab === "outline"));
    thumbsTab.setAttribute("aria-pressed", String(activeTab === "thumbs"));
    outlinePanel.hidden = activeTab !== "outline";
    thumbsPanel.hidden = activeTab !== "thumbs";
  };
  outlineTab.onclick = () => {
    activeTab = "outline";
    syncTabs();
  };
  thumbsTab.onclick = () => {
    activeTab = "thumbs";
    syncTabs();
  };
  syncTabs();

  sidebar.append(tabs, outlinePanel, thumbsPanel);

  return {
    element: sidebar,
    setOpen(open: boolean) {
      sidebar.hidden = !open;
    },
    setCurrentPage(pageIndex: number) {
      for (let i = 0; i < thumbSlots.length; i += 1) {
        thumbSlots[i].button.dataset.active = String(i === pageIndex);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      thumbObserver?.disconnect();
      for (const slot of thumbSlots) {
        slot.canvas.width = 0;
        slot.canvas.height = 0;
      }
    },
  };
}
