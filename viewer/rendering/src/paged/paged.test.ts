import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateFitPageScale,
  calculateFitWidthScale,
  clampScale,
  computeCanvasPixelSize,
  createPagedDocumentViewport,
  selectEvictionCandidate,
  type PagedDocumentSource,
} from "./index";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("paged layout helpers", () => {
  it("clamps scales and computes fit-width / fit-page within gutters", () => {
    expect(clampScale(10, 0.25, 3)).toBe(3);
    expect(clampScale(0.1, 0.25, 3)).toBe(0.25);
    expect(clampScale(Number.NaN, 0.5, 3)).toBe(0.5);

    const fitWidth = calculateFitWidthScale(1_600, 600, 48, 0.25, 3);
    expect(600 * fitWidth + 48).toBeCloseTo(1_600);

    const fitPage = calculateFitPageScale(1_000, 700, 600, 1_200, 32, 40, 0.25, 3);
    expect(fitPage).toBeCloseTo((700 - 40) / 1_200);
  });

  it("caps canvas pixel dimensions to the maximum pixel budget", () => {
    const capped = computeCanvasPixelSize(4_000, 4_000, 2, 16_000_000);
    expect(capped.width * capped.height).toBeLessThanOrEqual(16_000_000);
    expect(capped.pixelRatio).toBeLessThanOrEqual(1);

    const normal = computeCanvasPixelSize(400, 600, 2, 16_000_000);
    expect(normal.width).toBe(800);
    expect(normal.height).toBe(1_200);
    expect(normal.pixelRatio).toBe(2);
  });

  it("evicts offscreen pages farthest from currentPage before visible pages", () => {
    const visible = new Set([4, 5]);
    const active = [0, 4, 5, 8];
    expect(selectEvictionCandidate(active, 5, 5, visible)).toBe(0);

    const allVisible = new Set([0, 1, 2]);
    expect(selectEvictionCandidate([0, 1, 2], 2, 2, allVisible)).toBe(0);
  });
});

describe("createPagedDocumentViewport", () => {
  it("renders pages, supports deferred setSource, dynamic sizing, zoom, keyboard navigation, and idempotent dispose", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const onEvictPage = vi.fn();
    const disposeSource = vi.fn();
    const renderCalls: Array<{ pageIndex: number; scale: number }> = [];

    const view = createPagedDocumentViewport({
      fileName: "report.pdf",
      locale: "en",
      className: "anyfile-test-paged",
      initialStatus: "Loading document…",
      maxActiveCanvasPages: 2,
    });
    document.body.append(view.root);

    expect(view.root.querySelector('[role="status"]')?.textContent).toBe("Loading document…");
    expect((view.root.querySelector('[aria-label="Next page"]') as HTMLButtonElement).disabled).toBe(true);

    const source: PagedDocumentSource = {
      pageCount: 4,
      defaultPageSize: { width: 600, height: 800 },
      async renderPage(pageIndex, canvas, request) {
        renderCalls.push({ pageIndex, scale: request.scale });
        canvas.width = Math.round(request.displayWidth);
        canvas.height = Math.round(request.displayHeight);
        if (pageIndex === 1) return { width: 900, height: 600 };
      },
      onEvictPage,
      dispose: disposeSource,
    };

    view.setSource(source);
    await vi.waitFor(() => expect(renderCalls.length).toBe(1));
    expect(renderCalls[0]).toEqual({ pageIndex: 0, scale: 1 });
    expect(view.root.querySelectorAll(".anyfile-paged-viewer__page").length).toBe(4);

    // Navigate via keyboard to page 2 (landscape discovered lazily)
    view.viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    await vi.waitFor(() => expect(renderCalls.some((c) => c.pageIndex === 1)).toBe(true));
    const page2Section = view.root.querySelector('[data-page="1"]') as HTMLElement;
    expect(page2Section.style.width).toBe("900px");
    expect(page2Section.style.height).toBe("600px");

    // Navigate to page 3 -> triggers eviction because maxActiveCanvasPages = 2
    view.jumpToPage(2);
    await vi.waitFor(() => expect(onEvictPage).toHaveBeenCalledWith(0));
    const page0Canvas = view.root.querySelector('[data-page="0"] canvas') as HTMLCanvasElement;
    expect(page0Canvas.width).toBe(0);

    // Zoom in re-renders current page at larger scale
    (view.root.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(renderCalls.at(-1)?.scale).toBeCloseTo(1.2));
    expect(view.root.querySelector(".anyfile-paged-viewer__zoom")?.textContent).toBe("120%");

    // Repeated dispose is idempotent
    view.dispose();
    view.dispose();
    expect(disposeSource).toHaveBeenCalledOnce();
    expect(document.body.children.length).toBe(0);
  });

  it("mounts outline, text layer, footer link, and creates thumbnails lazily only when opened", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const renderThumbnail = vi.fn(async () => {});
    const getPageText = vi.fn(async () => ({
      scale: 1000,
      words: [{ x: 100, y: 100, w: 200, h: 50, text: "Hello" }],
    }));

    const view = createPagedDocumentViewport({
      fileName: "book.djvu",
      locale: "zh-CN",
      footerLink: { href: "/source/djvu.html", label: "Source" },
      source: {
        pageCount: 2,
        pages: [
          { width: 600, height: 800 },
          { width: 600, height: 800 },
        ],
        outline: [{ title: "Chapter 2", page: 1, children: [] }],
        async renderPage(_idx, canvas) {
          canvas.width = 600;
          canvas.height = 800;
        },
        renderThumbnail,
        getPageText,
      },
    });
    document.body.append(view.root);

    await vi.waitFor(() => expect(view.root.querySelector(".anyfile-paged-viewer__text-word")?.textContent).toBe("Hello "));
    expect(view.root.querySelector('a[href="/source/djvu.html"]')?.textContent).toBe("Source");
    // Sidebar is closed by default, so no thumbnail canvas elements exist yet.
    expect(view.root.querySelectorAll(".anyfile-paged-viewer__thumb canvas").length).toBe(0);

    // Open sidebar and switch to Thumbnails tab -> thumbnails mount lazily
    const sidebarBtn = view.root.querySelector('[aria-label="导航"]') as HTMLButtonElement;
    sidebarBtn.click();
    const thumbsTab = Array.from(view.root.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === "缩略图",
    ) as HTMLButtonElement;
    thumbsTab.click();
    expect(view.root.querySelectorAll(".anyfile-paged-viewer__thumb canvas").length).toBe(2);

    // Toggle text layer off and back on
    const textBtn = view.root.querySelector('[aria-label="文本层"]') as HTMLButtonElement;
    textBtn.click();
    expect((view.root.querySelector(".anyfile-paged-viewer__text-layer") as HTMLElement).hidden).toBe(true);
    textBtn.click();
    expect((view.root.querySelector(".anyfile-paged-viewer__text-layer") as HTMLElement).hidden).toBe(false);

    view.dispose();
  });

  it("aborts stale renders on rapid zoom and shows alert status on error", async () => {
    const signals: AbortSignal[] = [];
    let resolveSecond!: () => void;
    let callCount = 0;

    const view = createPagedDocumentViewport({
      fileName: "slow.pdf",
      locale: "en",
      source: {
        pageCount: 1,
        pages: [{ width: 500, height: 700 }],
        renderPage(_idx, _canvas, request) {
          callCount += 1;
          signals.push(request.signal);
          if (callCount === 1) {
            return new Promise<void>(() => {
              // Never resolves; should be aborted by zoom.
            });
          }
          return new Promise<void>((resolve) => {
            resolveSecond = resolve;
          });
        },
      },
    });
    document.body.append(view.root);

    expect(signals.length).toBe(1);
    expect(signals[0].aborted).toBe(false);

    (view.root.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click();
    expect(signals[0].aborted).toBe(true);
    expect(signals.length).toBe(2);

    resolveSecond();
    await Promise.resolve();

    view.showStatus("Failed to load", { isError: true });
    const status = view.root.querySelector('[role="alert"]');
    expect(status?.textContent).toBe("Failed to load");

    view.dispose();
  });
});
