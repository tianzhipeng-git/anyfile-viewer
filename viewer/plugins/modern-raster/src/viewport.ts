import { CanvasSurface, InteractiveViewport, type ViewTransform } from "@anyfile/viewer-rendering";
import type { ModernRasterElements } from "./ui";

export class ModernBitmapViewport {
  private readonly surface: CanvasSurface;
  private readonly viewport: InteractiveViewport;
  private transform: ViewTransform = { scale: 1, rotation: 0, panX: 0, panY: 0 };
  private bitmap?: ImageBitmap;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(private readonly elements: ModernRasterElements) {
    if (!elements.canvas.getContext("2d", { alpha: true })) throw new Error("Canvas 2D is unavailable.");
    this.surface = new CanvasSurface(elements.canvas, elements.viewport, (context, width, height, dpr) => this.draw(context, width, height, dpr));
    this.viewport = new InteractiveViewport(elements, 1, 1, (transform) => { this.transform = transform; this.surface.schedule(); });
  }

  setBitmap(bitmap: ImageBitmap) {
    if (this.disposed) { bitmap.close(); return; }
    this.bitmap?.close();
    this.bitmap = bitmap;
    this.width = bitmap.width;
    this.height = bitmap.height;
    this.viewport.setContentSize(bitmap.width, bitmap.height);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.viewport.dispose(); this.surface.dispose(); this.bitmap?.close(); this.bitmap = undefined;
  }

  private draw(context: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    if (!this.bitmap || this.disposed) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    context.translate(width / 2 + this.transform.panX, height / 2 + this.transform.panY); context.rotate(this.transform.rotation * Math.PI / 180); context.scale(this.transform.scale, this.transform.scale);
    context.drawImage(this.bitmap, -this.width / 2, -this.height / 2);
  }
}
