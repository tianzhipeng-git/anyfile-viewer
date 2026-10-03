import { InteractiveViewport } from "@anyfile/viewer-rendering";
import { ViewerError } from "@anyfile/viewer-protocol";
import { pageSize } from "./page";
import type { Copy } from "./messages";
import type { VisioWorkerClient } from "./worker-client";

const styles = `
.anyfile-visio{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui)}
.anyfile-visio__tools{display:flex;flex:none;align-items:center;gap:8px;overflow-x:auto;padding:8px;border-bottom:1px solid var(--viewer-border,#ddd);font-size:13px}
.anyfile-visio button,.anyfile-visio select{flex:none;min-height:32px;border:1px solid var(--viewer-border,#ddd);border-radius:6px;background:var(--viewer-background,#fff);color:inherit;padding:0 8px;font:inherit}
.anyfile-visio :focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:1px}.anyfile-visio button:disabled{opacity:.4}
.anyfile-visio__viewport{position:relative;min-height:0;min-width:0;flex:1;overflow:hidden;touch-action:none;cursor:grab;background:color-mix(in srgb,var(--viewer-background,#fff) 92%,var(--viewer-foreground,#111));user-select:none}
.anyfile-visio__viewport[data-dragging=true]{cursor:grabbing}.anyfile-visio__viewport img{position:absolute;left:50%;top:50%;max-width:none;max-height:none;transform-origin:center;pointer-events:none;background:white;box-shadow:0 3px 18px #0002}
.anyfile-visio__status{flex:none;padding:6px 10px;font-size:12px}.anyfile-visio output{min-width:44px;text-align:center}
`;
function button(label: string, text = label) {
  const element = document.createElement("button");
  element.type = "button"; element.textContent = text; element.title = label; element.setAttribute("aria-label", label);
  return element;
}
export class VisioView {
  readonly root = document.createElement("div");
  private readonly viewport = document.createElement("div");
  private readonly image = document.createElement("img");
  private readonly select = document.createElement("select");
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly status = document.createElement("div");
  private readonly interactive: InteractiveViewport;
  private readonly abort = new AbortController();
  private objectUrl?: string;
  private page = 0;
  private busy = false;
  private disposed = false;
  constructor(private readonly pages: number, private readonly client: VisioWorkerClient, private readonly copy: Copy) {
    this.root.className = "anyfile-visio";
    const style = document.createElement("style"); style.textContent = styles;
    const tools = document.createElement("div"); tools.className = "anyfile-visio__tools"; tools.setAttribute("role", "toolbar"); tools.setAttribute("aria-label", copy.tools);
    this.previous = button(copy.previous, "←"); this.next = button(copy.next, "→");
    this.select.setAttribute("aria-label", copy.page);
    for (let index = 0; index < pages; index++) { const option = document.createElement("option"); option.value = String(index); option.textContent = `${index + 1} / ${pages}`; this.select.append(option); }
    const zoomOut = button(copy.zoomOut, "−"), zoomIn = button(copy.zoomIn, "+"), fit = button(copy.fit), actual = button(copy.actual, "1:1"), rotateLeft = button(copy.rotateLeft, "↺"), rotateRight = button(copy.rotateRight, "↻");
    const zoomValue = document.createElement("output"); zoomValue.setAttribute("aria-live", "polite");
    tools.append(this.previous, this.select, this.next, zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight);
    this.viewport.className = "anyfile-visio__viewport"; this.viewport.tabIndex = 0; this.viewport.setAttribute("aria-label", copy.canvas);
    this.image.draggable = false; this.image.alt = copy.canvas; this.viewport.append(this.image);
    this.status.className = "anyfile-visio__status"; this.status.setAttribute("role", "status");
    this.root.append(style, tools, this.viewport, this.status);
    this.interactive = new InteractiveViewport({ viewport: this.viewport, zoomValue, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual }, 1, 1, ({ scale, rotation, panX, panY }) => {
      this.image.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) rotate(${rotation}deg) scale(${scale})`;
    });
    this.previous.onclick = () => { void this.navigate(this.page - 1); };
    this.next.onclick = () => { void this.navigate(this.page + 1); };
    this.select.onchange = () => { void this.navigate(Number(this.select.value)); };
  }
  private async navigate(index: number) {
    try { await this.render(index); }
    catch { if (!this.disposed) { this.status.setAttribute("role", "alert"); this.status.textContent = this.copy.failed; } }
  }
  async render(index = 0) {
    if (this.disposed || this.busy || index < 0 || index >= this.pages) return;
    this.busy = true; this.updateControls(); this.status.setAttribute("role", "status"); this.status.textContent = this.copy.rendering;
    let nextUrl: string | undefined;
    try {
      const svg = await this.client.page(index);
      this.abort.signal.throwIfAborted();
      // SVG loaded as an image is a secure, non-interactive document: scripts and
      // external subresources are disabled by the browser. Never inject into DOM.
      const { width, height } = pageSize(svg, this.copy);
      nextUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      await this.decode(nextUrl);
      this.abort.signal.throwIfAborted();
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = nextUrl; nextUrl = undefined;
      this.page = index; this.image.style.width = `${width}px`; this.image.style.height = `${height}px`;
      this.interactive.setContentSize(width, height); this.status.textContent = this.copy.note;
    } finally {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      this.busy = false;
      if (!this.disposed) this.updateControls();
    }
  }
  private decode(url: string) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        this.image.onload = this.image.onerror = null; this.abort.signal.removeEventListener("abort", cancel);
        if (error) reject(error); else resolve();
      };
      const cancel = () => finish(new DOMException("Aborted", "AbortError"));
      this.abort.signal.addEventListener("abort", cancel, { once: true });
      this.image.onload = () => finish();
      this.image.onerror = () => finish(new ViewerError("invalid-file", this.copy.invalid));
      this.image.src = url;
    });
  }
  private updateControls() {
    this.select.value = String(this.page); this.select.disabled = this.busy;
    this.previous.disabled = this.busy || this.page === 0; this.next.disabled = this.busy || this.page === this.pages - 1;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.interactive.dispose();
    this.previous.onclick = this.next.onclick = this.select.onchange = null;
    this.image.removeAttribute("src");
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.root.remove();
  }
}
