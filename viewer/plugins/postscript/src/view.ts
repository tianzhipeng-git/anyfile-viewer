import type { PostscriptPageInfo } from "./types";
import { PostscriptWorkerClient } from "./worker-client";

const MAX_CANVAS_PIXELS = 16_000_000;
const ZOOM_LEVELS = [0.5, 1, 2, 4] as const;

export interface PostscriptCopy {
  fitWidth: string;
  nextPage: string;
  page: string;
  pageDiscoveryFailed: string;
  previousPage: string;
  renderFailed: string;
  rendering: string;
  zoomIn: string;
  zoomOut: string;
}

function button(label: string, title: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.title = title;
  element.setAttribute("aria-label", title);
  return element;
}

export class PostscriptView {
  readonly root: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly pageState: HTMLElement;
  private readonly zoomState: HTMLElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly zoomOut: HTMLButtonElement;
  private readonly zoomIn: HTMLButtonElement;
  private readonly fit: HTMLButtonElement;
  private readonly resizeObserver?: ResizeObserver;
  private pages: PostscriptPageInfo[];
  private currentPage = 0;
  private zoomIndex = 1;
  private streaming: boolean;
  private stepping = false;
  private renderGeneration = 0;
  private resizeFrame = 0;
  private disposed = false;

  constructor(
    fileName: string,
    pages: readonly PostscriptPageInfo[],
    streaming: boolean,
    private readonly copy: PostscriptCopy,
    private readonly client: PostscriptWorkerClient,
  ) {
    this.pages = [...pages];
    this.streaming = streaming;
    this.root = document.createElement("div");
    this.root.className = "anyfile-postscript-viewer";
    const style = document.createElement("style");
    style.textContent = `
      .anyfile-postscript-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:#e7e9ee;color:var(--viewer-foreground,#111827);font-family:var(--viewer-font-family,system-ui)}
      .anyfile-postscript-viewer__toolbar{z-index:2;display:grid;flex:none;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:16px;min-height:52px;padding:8px 14px;border-bottom:1px solid var(--viewer-border,#d1d5db);background:color-mix(in srgb,var(--viewer-background,#fff) 94%,transparent);box-shadow:0 1px 5px rgb(15 23 42/7%)}
      .anyfile-postscript-viewer__name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.anyfile-postscript-viewer__page-state{color:#64748b;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
      .anyfile-postscript-viewer__controls{display:flex;justify-self:end;align-items:center;gap:6px}.anyfile-postscript-viewer button{display:inline-grid;min-width:32px;height:32px;place-items:center;border:1px solid var(--viewer-border,#d1d5db);border-radius:8px;background:var(--viewer-background,#fff);color:inherit;padding:0 9px;font:inherit;font-size:13px;cursor:pointer}
      .anyfile-postscript-viewer button:hover{border-color:#9ca3af;background:#f8fafc}.anyfile-postscript-viewer button:focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:2px}.anyfile-postscript-viewer button:disabled{cursor:not-allowed;opacity:.42}.anyfile-postscript-viewer__zoom{min-width:48px;color:#475569;text-align:center;font-size:12px;font-variant-numeric:tabular-nums}
      .anyfile-postscript-viewer__viewport{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain}.anyfile-postscript-viewer__surface{box-sizing:border-box;display:grid;min-height:100%;min-width:100%;place-items:center;padding:28px 24px}.anyfile-postscript-viewer__page{position:relative;overflow:hidden;background:#fff;box-shadow:0 2px 8px rgb(15 23 42/14%),0 14px 34px rgb(15 23 42/10%)}
      .anyfile-postscript-viewer__canvas{display:block;width:100%;height:100%}.anyfile-postscript-viewer__status{position:absolute;inset:0;display:grid;place-items:center;background:rgb(255 255 255/88%);color:#64748b;font-size:13px;text-align:center}.anyfile-postscript-viewer__status[hidden]{display:none}.anyfile-postscript-viewer__status--error{color:#991b1b}
      @media(max-width:720px){.anyfile-postscript-viewer__toolbar{grid-template-columns:minmax(0,1fr) auto;gap:8px}.anyfile-postscript-viewer__page-state{display:none}.anyfile-postscript-viewer__fit{display:none!important}.anyfile-postscript-viewer__surface{padding:16px 12px}}
    `;

    const toolbar = document.createElement("div");
    toolbar.className = "anyfile-postscript-viewer__toolbar";
    const name = document.createElement("strong");
    name.className = "anyfile-postscript-viewer__name";
    name.textContent = fileName;
    name.title = fileName;
    this.pageState = document.createElement("span");
    this.pageState.className = "anyfile-postscript-viewer__page-state";
    this.pageState.setAttribute("aria-live", "polite");
    const controls = document.createElement("div");
    controls.className = "anyfile-postscript-viewer__controls";
    this.previous = button("‹", copy.previousPage);
    this.next = button("›", copy.nextPage);
    this.zoomOut = button("−", copy.zoomOut);
    this.zoomIn = button("+", copy.zoomIn);
    this.fit = button(copy.fitWidth, copy.fitWidth);
    this.fit.className = "anyfile-postscript-viewer__fit";
    this.zoomState = document.createElement("span");
    this.zoomState.className = "anyfile-postscript-viewer__zoom";
    controls.append(this.previous, this.next, this.zoomOut, this.zoomState, this.zoomIn, this.fit);
    toolbar.append(name, this.pageState, controls);

    this.viewport = document.createElement("div");
    this.viewport.className = "anyfile-postscript-viewer__viewport";
    const surface = document.createElement("div");
    surface.className = "anyfile-postscript-viewer__surface";
    const page = document.createElement("div");
    page.className = "anyfile-postscript-viewer__page";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "anyfile-postscript-viewer__canvas";
    this.status = document.createElement("div");
    this.status.className = "anyfile-postscript-viewer__status";
    this.status.setAttribute("role", "status");
    page.append(this.canvas, this.status);
    surface.append(page);
    this.viewport.append(surface);
    this.root.append(style, toolbar, this.viewport);

    this.previous.addEventListener("click", this.showPrevious);
    this.next.addEventListener("click", this.showNext);
    this.zoomOut.addEventListener("click", this.decreaseZoom);
    this.zoomIn.addEventListener("click", this.increaseZoom);
    this.fit.addEventListener("click", this.resetZoom);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.handleResize);
    }
    this.updateToolbar();
  }

  activate() {
    this.resizeObserver?.observe(this.viewport);
  }

  appendPages(pages: readonly PostscriptPageInfo[], done: boolean) {
    if (this.disposed) return;
    this.pages.push(...pages);
    this.streaming = !done;
    this.updateToolbar();
  }

  async renderCurrent(throwOnError = false) {
    if (this.disposed) return;
    const info = this.pages[this.currentPage];
    if (!info) return;
    const generation = ++this.renderGeneration;
    this.status.hidden = false;
    this.status.classList.remove("anyfile-postscript-viewer__status--error");
    this.status.textContent = this.copy.rendering;
    const availableWidth = Math.max(320, this.viewport.clientWidth || 800) - 48;
    const zoom = ZOOM_LEVELS[this.zoomIndex];
    const cssWidth = Math.max(1, Math.round(availableWidth * zoom));
    const cssHeight = Math.max(1, Math.round(cssWidth * info.height / info.width));
    const desiredRatio = Math.min(window.devicePixelRatio || 1, 2);
    const limitedRatio = Math.min(desiredRatio, Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight)));
    const pixelWidth = Math.max(1, Math.floor(cssWidth * limitedRatio));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * limitedRatio));
    const page = this.canvas.parentElement as HTMLElement;
    page.style.width = `${cssWidth}px`;
    page.style.height = `${cssHeight}px`;
    try {
      const result = await this.client.render(this.currentPage, pixelWidth, pixelHeight);
      if (this.disposed || generation !== this.renderGeneration) return;
      const context = this.canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas 2D is unavailable.");
      this.canvas.width = result.width;
      this.canvas.height = result.height;
      context.putImageData(new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height), 0, 0);
      this.status.hidden = true;
    } catch (error) {
      if (this.disposed || generation !== this.renderGeneration || (error instanceof DOMException && error.name === "AbortError")) return;
      this.status.hidden = false;
      this.status.classList.add("anyfile-postscript-viewer__status--error");
      this.status.setAttribute("role", "alert");
      this.status.textContent = this.copy.renderFailed;
      if (throwOnError) throw error;
    }
  }

  private readonly showPrevious = () => {
    if (this.currentPage === 0) return;
    this.currentPage -= 1;
    this.viewport.scrollTo(0, 0);
    this.updateToolbar();
    void this.renderCurrent();
  };

  private readonly showNext = () => {
    void this.advancePage();
  };

  private async advancePage() {
    if (this.stepping) return;
    if (this.currentPage >= this.pages.length - 1 && this.streaming) {
      this.stepping = true;
      this.updateToolbar();
      this.status.hidden = false;
      this.status.classList.remove("anyfile-postscript-viewer__status--error");
      this.status.setAttribute("role", "status");
      this.status.textContent = this.copy.rendering;
      try {
        const result = await this.client.step();
        this.appendPages(result.pages, result.done);
        if (result.pages.length === 0) this.status.hidden = true;
      } catch (error) {
        if (this.disposed || (error instanceof DOMException && error.name === "AbortError")) return;
        this.streaming = false;
        this.status.hidden = false;
        this.status.classList.add("anyfile-postscript-viewer__status--error");
        this.status.setAttribute("role", "alert");
        this.status.textContent = this.copy.pageDiscoveryFailed;
      } finally {
        this.stepping = false;
        this.updateToolbar();
      }
    }
    if (this.currentPage >= this.pages.length - 1) return;
    this.currentPage += 1;
    this.viewport.scrollTo(0, 0);
    this.updateToolbar();
    await this.renderCurrent();
  }

  private readonly decreaseZoom = () => {
    if (this.zoomIndex === 0) return;
    this.zoomIndex -= 1;
    this.updateToolbar();
    void this.renderCurrent();
  };

  private readonly increaseZoom = () => {
    if (this.zoomIndex === ZOOM_LEVELS.length - 1) return;
    this.zoomIndex += 1;
    this.updateToolbar();
    void this.renderCurrent();
  };

  private readonly resetZoom = () => {
    this.zoomIndex = 1;
    this.updateToolbar();
    void this.renderCurrent();
  };

  private readonly handleResize = () => {
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => void this.renderCurrent());
  };

  private updateToolbar() {
    const suffix = this.streaming ? "+" : "";
    this.pageState.textContent = `${this.copy.page} ${this.currentPage + 1} / ${this.pages.length}${suffix}`;
    this.zoomState.textContent = `${Math.round(ZOOM_LEVELS[this.zoomIndex] * 100)}%`;
    this.previous.disabled = this.currentPage === 0;
    this.next.disabled = this.stepping || (!this.streaming && this.currentPage >= this.pages.length - 1);
    this.zoomOut.disabled = this.zoomIndex === 0;
    this.zoomIn.disabled = this.zoomIndex === ZOOM_LEVELS.length - 1;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderGeneration += 1;
    cancelAnimationFrame(this.resizeFrame);
    this.resizeObserver?.disconnect();
    this.previous.removeEventListener("click", this.showPrevious);
    this.next.removeEventListener("click", this.showNext);
    this.zoomOut.removeEventListener("click", this.decreaseZoom);
    this.zoomIn.removeEventListener("click", this.increaseZoom);
    this.fit.removeEventListener("click", this.resetZoom);
    this.root.remove();
  }
}
