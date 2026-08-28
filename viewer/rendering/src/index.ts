export type ViewMode = "fit" | "actual" | "manual";

export interface ViewTransform {
  readonly scale: number;
  readonly rotation: number;
  readonly panX: number;
  readonly panY: number;
}

export interface ViewportControls {
  readonly viewport: HTMLElement;
  readonly zoomValue: HTMLOutputElement;
  readonly rotateLeft: HTMLButtonElement;
  readonly rotateRight: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly fit: HTMLButtonElement;
  readonly actual: HTMLButtonElement;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export class ResourceScope {
  private readonly cleanups: Array<() => void> = [];
  private disposed = false;

  add(cleanup: () => void) {
    if (this.disposed) cleanup();
    else this.cleanups.push(cleanup);
  }

  listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, listener, options);
    this.add(() => target.removeEventListener(type, listener, options));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
}

export class InteractiveViewport {
  private readonly resources = new ResourceScope();
  private imageWidth: number;
  private imageHeight: number;
  private scale = 1;
  private rotation = 0;
  private panX = 0;
  private panY = 0;
  private mode: ViewMode = "fit";
  private drag?: { pointerId: number; x: number; y: number };

  constructor(
    private readonly elements: ViewportControls,
    width: number,
    height: number,
    private readonly onTransform: (transform: ViewTransform) => void,
  ) {
    this.imageWidth = width;
    this.imageHeight = height;
    this.resources.listen(elements.zoomIn, "click", () => this.zoomBy(1.25));
    this.resources.listen(elements.zoomOut, "click", () => this.zoomBy(0.8));
    this.resources.listen(elements.fit, "click", () => this.fit());
    this.resources.listen(elements.actual, "click", () => this.actualSize());
    this.resources.listen(elements.rotateLeft, "click", () => this.rotate(-90));
    this.resources.listen(elements.rotateRight, "click", () => this.rotate(90));
    this.resources.listen(elements.viewport, "wheel", (event) => this.onWheel(event as WheelEvent), { passive: false });
    this.resources.listen(elements.viewport, "pointerdown", (event) => this.onPointerDown(event as PointerEvent));
    this.resources.listen(elements.viewport, "pointermove", (event) => this.onPointerMove(event as PointerEvent));
    this.resources.listen(elements.viewport, "pointerup", (event) => this.onPointerUp(event as PointerEvent));
    this.resources.listen(elements.viewport, "pointercancel", (event) => this.onPointerUp(event as PointerEvent));
    this.resources.listen(elements.viewport, "keydown", (event) => this.onKeyDown(event as KeyboardEvent));
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => this.mode === "fit" ? this.fit() : this.render());
      observer.observe(elements.viewport);
      this.resources.add(() => observer.disconnect());
    }
    this.fit();
  }

  setContentSize(width: number, height: number) {
    this.imageWidth = width;
    this.imageHeight = height;
    this.rotation = 0;
    this.fit();
  }

  dispose() { this.resources.dispose(); }

  private viewportSize() {
    return { width: this.elements.viewport.clientWidth || 800, height: this.elements.viewport.clientHeight || 600 };
  }

  private rotatedSize() {
    const swapsAxes = Math.abs(this.rotation / 90) % 2 === 1;
    return swapsAxes ? { width: this.imageHeight, height: this.imageWidth } : { width: this.imageWidth, height: this.imageHeight };
  }

  private fit() {
    const viewport = this.viewportSize();
    const image = this.rotatedSize();
    this.scale = clamp(Math.min(Math.max(1, viewport.width - 32) / image.width, Math.max(1, viewport.height - 32) / image.height, 1), MIN_SCALE, MAX_SCALE);
    this.panX = 0;
    this.panY = 0;
    this.mode = "fit";
    this.render();
  }

  private actualSize() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.mode = "actual";
    this.render();
  }

  private zoomBy(factor: number, clientX?: number, clientY?: number) {
    const previous = this.scale;
    const next = clamp(previous * factor, MIN_SCALE, MAX_SCALE);
    if (next === previous) return;
    if (clientX !== undefined && clientY !== undefined) {
      const bounds = this.elements.viewport.getBoundingClientRect();
      const anchorX = clientX - bounds.left - bounds.width / 2;
      const anchorY = clientY - bounds.top - bounds.height / 2;
      const ratio = next / previous;
      this.panX = anchorX - (anchorX - this.panX) * ratio;
      this.panY = anchorY - (anchorY - this.panY) * ratio;
    }
    this.scale = next;
    this.mode = "manual";
    this.render();
  }

  private rotate(degrees: number) {
    this.rotation = (this.rotation + degrees + 360) % 360;
    if (this.mode === "fit") this.fit();
    else this.render();
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.elements.viewport.dataset.dragging = "true";
    this.elements.viewport.setPointerCapture?.(event.pointerId);
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.panX += event.clientX - this.drag.x;
    this.panY += event.clientY - this.drag.y;
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.mode = "manual";
    this.render();
  }

  private onPointerUp(event: PointerEvent) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.elements.viewport.releasePointerCapture?.(event.pointerId);
    this.drag = undefined;
    delete this.elements.viewport.dataset.dragging;
  }

  private onKeyDown(event: KeyboardEvent) {
    const panStep = event.shiftKey ? 80 : 24;
    if (event.key === "+" || event.key === "=") this.zoomBy(1.25);
    else if (event.key === "-") this.zoomBy(0.8);
    else if (event.key === "0") this.fit();
    else if (event.key === "1") this.actualSize();
    else if (event.key === "ArrowLeft") this.panX -= panStep;
    else if (event.key === "ArrowRight") this.panX += panStep;
    else if (event.key === "ArrowUp") this.panY -= panStep;
    else if (event.key === "ArrowDown") this.panY += panStep;
    else return;
    if (event.key.startsWith("Arrow")) {
      this.mode = "manual";
      this.render();
    }
    event.preventDefault();
  }

  private render() {
    this.elements.zoomValue.value = `${Math.round(this.scale * 100)}%`;
    this.elements.zoomValue.textContent = this.elements.zoomValue.value;
    this.onTransform({ scale: this.scale, rotation: this.rotation, panX: this.panX, panY: this.panY });
  }
}

export class CanvasSurface {
  private readonly resources = new ResourceScope();
  private frame?: number;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    private readonly draw: (context: CanvasRenderingContext2D, width: number, height: number, dpr: number) => void,
    private readonly maximumEdge = 8192,
  ) {
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => this.schedule());
      observer.observe(viewport);
      this.resources.add(() => observer.disconnect());
    }
  }

  schedule() {
    if (this.disposed || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.render();
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.dispose();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  private render() {
    if (this.disposed) return;
    const width = this.viewport.clientWidth || 800;
    const height = this.viewport.clientHeight || 600;
    const requestedDpr = Math.max(1, window.devicePixelRatio || 1);
    const dpr = Math.min(requestedDpr, this.maximumEdge / width, this.maximumEdge / height);
    const physicalWidth = Math.max(1, Math.round(width * dpr));
    const physicalHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== physicalWidth) this.canvas.width = physicalWidth;
    if (this.canvas.height !== physicalHeight) this.canvas.height = physicalHeight;
    const context = this.canvas.getContext("2d", { alpha: true });
    if (context) this.draw(context, width, height, dpr);
  }
}
