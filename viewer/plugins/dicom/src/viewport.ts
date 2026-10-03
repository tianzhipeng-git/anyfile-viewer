import { CanvasSurface, InteractiveViewport, type ViewTransform } from "@anyfile/viewer-rendering";
import { ViewerError } from "@anyfile/viewer-protocol";
import type { DicomUI } from "./ui";

export class DicomViewport {
  private readonly image = document.createElement("canvas");
  private readonly surface: CanvasSurface;
  private readonly viewport: InteractiveViewport;
  private transform: ViewTransform = { scale: 1, rotation: 0, panX: 0, panY: 0 };

  constructor(ui: DicomUI, width: number, height: number) {
    this.image.width = width; this.image.height = height;
    if (!this.image.getContext("2d") || !ui.canvas.getContext("2d")) throw new ViewerError("unsupported-environment", "Canvas 2D unavailable.");
    this.surface = new CanvasSurface(ui.canvas, ui.viewport, (context, w, h, dpr) => {
      const t = this.transform;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, w, h);
      context.translate(w / 2 + t.panX, h / 2 + t.panY);
      context.rotate(t.rotation * Math.PI / 180);
      context.scale(t.scale, t.scale);
      context.drawImage(this.image, -width / 2, -height / 2);
    });
    this.viewport = new InteractiveViewport(ui, width, height, (transform) => {
      this.transform = transform;
      this.surface.schedule();
    });
  }

  setPixels(rgba: Uint8ClampedArray) {
    const pixels = new ImageData(new Uint8ClampedArray(rgba), this.image.width, this.image.height);
    this.image.getContext("2d")!.putImageData(pixels, 0, 0);
    this.surface.schedule();
  }

  dispose() {
    this.viewport.dispose(); this.surface.dispose();
    this.image.width = 0; this.image.height = 0;
  }
}
