import {
  CanvasSurface,
  InteractiveViewport,
  type ViewTransform,
} from "@anyfile/viewer-rendering";

import type { CadPoint, CadPrimitive, CadScene } from "./scene";
import type { CadViewerElements } from "./ui";

const NORMALIZED_MODEL_EDGE = 1_000;

function cadModelScale(scene: CadScene) {
  const maximumEdge = Math.max(scene.bounds.width, scene.bounds.height);
  if (!Number.isFinite(maximumEdge) || maximumEdge <= Number.EPSILON) return 1;
  const scale = NORMALIZED_MODEL_EDGE / maximumEdge;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export class Cad2dViewport {
  private readonly surface: CanvasSurface;
  private readonly interactive: InteractiveViewport;
  private readonly modelScale: number;
  private transform: ViewTransform = { scale: 1, rotation: 0, panX: 0, panY: 0 };
  private disposed = false;

  constructor(
    private readonly elements: CadViewerElements,
    private readonly scene: CadScene,
  ) {
    if (!elements.canvas.getContext("2d", { alpha: true })) {
      throw new Error("Canvas 2D is unavailable.");
    }
    this.modelScale = cadModelScale(scene);
    this.surface = new CanvasSurface(
      elements.canvas,
      elements.viewport,
      (context, width, height, dpr) => this.draw(context, width, height, dpr),
    );
    this.interactive = new InteractiveViewport(
      elements,
      scene.bounds.width * this.modelScale,
      scene.bounds.height * this.modelScale,
      (transform) => {
        this.transform = transform;
        this.surface.schedule();
      },
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.interactive.dispose();
    this.surface.dispose();
  }

  private localPoint(value: CadPoint) {
    const centerX = (this.scene.bounds.minX + this.scene.bounds.maxX) / 2;
    const centerY = (this.scene.bounds.minY + this.scene.bounds.maxY) / 2;
    return {
      x: (value.x - centerX) * this.modelScale,
      y: (centerY - value.y) * this.modelScale,
    };
  }

  private draw(context: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (this.scene.primitives.length === 0) {
      context.fillStyle = "color-mix(in srgb, var(--viewer-foreground, #111) 58%, transparent)";
      context.font = "13px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("No drawable entities", width / 2, height / 2);
      return;
    }

    context.save();
    context.translate(width / 2 + this.transform.panX, height / 2 + this.transform.panY);
    context.rotate((this.transform.rotation * Math.PI) / 180);
    context.scale(this.transform.scale, this.transform.scale);

    const strokeWidth = 1 / (this.transform.scale * dpr);
    context.lineWidth = strokeWidth;
    context.lineJoin = "round";
    context.lineCap = "round";

    for (const primitive of this.scene.primitives) {
      this.drawPrimitive(context, primitive, strokeWidth);
    }

    context.restore();
  }

  private drawPrimitive(context: CanvasRenderingContext2D, primitive: CadPrimitive, strokeWidth: number) {
    context.strokeStyle = primitive.color;
    context.fillStyle = primitive.color;
    context.lineWidth = strokeWidth;

    switch (primitive.kind) {
      case "line":
        this.strokePoints(context, [primitive.points[0], primitive.points[1]], false);
        break;
      case "polyline":
        this.strokePoints(context, primitive.points, primitive.closed);
        break;
      case "solid":
        this.fillPoints(context, primitive.points);
        break;
      case "point": {
        const position = this.localPoint(primitive.position);
        context.beginPath();
        context.arc(position.x, position.y, strokeWidth * 2, 0, Math.PI * 2);
        context.fill();
        break;
      }
      case "text": {
        const position = this.localPoint(primitive.position);
        context.save();
        context.translate(position.x, position.y);
        context.rotate((-primitive.rotation * Math.PI) / 180);
        context.font = `500 ${Math.max(0.5, primitive.height * this.modelScale)}px sans-serif`;
        context.textAlign = "left";
        context.textBaseline = "bottom";
        context.fillText(primitive.text, 0, 0);
        context.restore();
        break;
      }
    }
  }

  private strokePoints(context: CanvasRenderingContext2D, points: readonly CadPoint[], closed: boolean) {
    if (points.length < 2) return;
    context.beginPath();
    const first = this.localPoint(points[0]);
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const value = this.localPoint(points[index]);
      context.lineTo(value.x, value.y);
    }
    if (closed) context.closePath();
    context.stroke();
  }

  private fillPoints(context: CanvasRenderingContext2D, points: readonly CadPoint[]) {
    if (points.length < 3) return;
    context.beginPath();
    const first = this.localPoint(points[0]);
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const value = this.localPoint(points[index]);
      context.lineTo(value.x, value.y);
    }
    context.closePath();
    context.globalAlpha = 0.5;
    context.fill();
    context.globalAlpha = 1;
  }
}
