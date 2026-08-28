import type { RasterViewerElements } from "./ui";

type ViewMode = "fit" | "actual" | "manual";
const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const MAX_CANVAS_EDGE = 8192;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export class CanvasRasterViewport {
  private readonly cleanups: Array<() => void> = [];
  private context: CanvasRenderingContext2D;
  private bitmap?: ImageBitmap;
  private imageWidth = 1;
  private imageHeight = 1;
  private scale = 1;
  private rotation = 0;
  private panX = 0;
  private panY = 0;
  private mode: ViewMode = "fit";
  private drag?: { pointerId: number; x: number; y: number };
  private observer?: ResizeObserver;
  private frame?: number;
  private disposed = false;

  constructor(private readonly elements: RasterViewerElements) {
    const context = elements.canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.listen(elements.zoomIn, "click", () => this.zoomBy(1.25));
    this.listen(elements.zoomOut, "click", () => this.zoomBy(0.8));
    this.listen(elements.fit, "click", () => this.fit());
    this.listen(elements.actual, "click", () => this.actualSize());
    this.listen(elements.rotateLeft, "click", () => this.rotate(-90));
    this.listen(elements.rotateRight, "click", () => this.rotate(90));
    this.listen(elements.viewport, "wheel", (event) => this.onWheel(event as WheelEvent), { passive: false });
    this.listen(elements.viewport, "pointerdown", (event) => this.onPointerDown(event as PointerEvent));
    this.listen(elements.viewport, "pointermove", (event) => this.onPointerMove(event as PointerEvent));
    this.listen(elements.viewport, "pointerup", (event) => this.onPointerUp(event as PointerEvent));
    this.listen(elements.viewport, "pointercancel", (event) => this.onPointerUp(event as PointerEvent));
    this.listen(elements.viewport, "keydown", (event) => this.onKeyDown(event as KeyboardEvent));
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => {
        if (this.mode === "fit") this.fit();
        else this.schedule();
      });
      this.observer.observe(elements.viewport);
    }
  }

  async setRaster(rgba: Uint8ClampedArray, width: number, height: number) {
    const pixels = new Uint8ClampedArray(rgba.byteLength);
    pixels.set(rgba);
    const bitmap = await createImageBitmap(new ImageData(pixels, width, height), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    if (this.disposed) {
      bitmap.close();
      return;
    }
    this.bitmap?.close();
    this.bitmap = bitmap;
    this.imageWidth = width;
    this.imageHeight = height;
    this.rotation = 0;
    this.fit();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = undefined;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.bitmap?.close();
    this.bitmap = undefined;
    this.elements.canvas.width = 0;
    this.elements.canvas.height = 0;
  }

  private listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, listener, options);
    this.cleanups.push(() => target.removeEventListener(type, listener, options));
  }

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
    this.schedule();
  }

  private actualSize() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.mode = "actual";
    this.schedule();
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
    this.schedule();
  }

  private rotate(degrees: number) {
    this.rotation = (this.rotation + degrees + 360) % 360;
    if (this.mode === "fit") this.fit();
    else this.schedule();
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
    this.schedule();
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
      this.schedule();
    }
    event.preventDefault();
  }

  private schedule() {
    if (this.disposed || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.render();
    });
  }

  private render() {
    if (!this.bitmap || this.disposed) return;
    const viewport = this.viewportSize();
    const requestedDpr = Math.max(1, window.devicePixelRatio || 1);
    const dpr = Math.min(requestedDpr, MAX_CANVAS_EDGE / viewport.width, MAX_CANVAS_EDGE / viewport.height);
    const width = Math.max(1, Math.round(viewport.width * dpr));
    const height = Math.max(1, Math.round(viewport.height * dpr));
    if (this.elements.canvas.width !== width) this.elements.canvas.width = width;
    if (this.elements.canvas.height !== height) this.elements.canvas.height = height;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.context.clearRect(0, 0, viewport.width, viewport.height);
    this.context.translate(viewport.width / 2 + this.panX, viewport.height / 2 + this.panY);
    this.context.rotate((this.rotation * Math.PI) / 180);
    this.context.scale(this.scale, this.scale);
    this.context.drawImage(this.bitmap, -this.imageWidth / 2, -this.imageHeight / 2);
    this.elements.zoomValue.value = `${Math.round(this.scale * 100)}%`;
    this.elements.zoomValue.textContent = this.elements.zoomValue.value;
  }
}
