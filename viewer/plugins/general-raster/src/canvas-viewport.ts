import { CanvasSurface, InteractiveViewport, type ViewTransform } from "@anyfile/viewer-rendering";

import type { RasterViewerElements } from "./ui";

export class CanvasRasterViewport {
  private readonly surface: CanvasSurface;
  private readonly viewport: InteractiveViewport;
  private bitmap?: ImageBitmap;
  private imageWidth = 1;
  private imageHeight = 1;
  private transform: ViewTransform = { scale: 1, rotation: 0, panX: 0, panY: 0 };
  private disposed = false;

  constructor(private readonly elements: RasterViewerElements) {
    if (!elements.canvas.getContext("2d", { alpha: true })) throw new Error("Canvas 2D is unavailable.");
    this.surface = new CanvasSurface(elements.canvas, elements.viewport, (context, width, height, dpr) => this.draw(context, width, height, dpr));
    this.viewport = new InteractiveViewport(elements, 1, 1, (transform) => {
      this.transform = transform;
      this.surface.schedule();
    });
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
    this.viewport.setContentSize(width, height);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.viewport.dispose();
    this.surface.dispose();
    this.bitmap?.close();
    this.bitmap = undefined;
  }

  private draw(context: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    if (!this.bitmap || this.disposed) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.translate(width / 2 + this.transform.panX, height / 2 + this.transform.panY);
    context.rotate((this.transform.rotation * Math.PI) / 180);
    context.scale(this.transform.scale, this.transform.scale);
    context.drawImage(this.bitmap, -this.imageWidth / 2, -this.imageHeight / 2);
  }
}
