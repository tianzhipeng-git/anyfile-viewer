import { CanvasSurface, InteractiveViewport, type ViewTransform } from "@anyfile/viewer-rendering";
import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export type PxdViewerElements = {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly zoomValue: HTMLOutputElement;
  readonly rotateLeft: HTMLButtonElement;
  readonly rotateRight: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly fit: HTMLButtonElement;
  readonly actual: HTMLButtonElement;
};

const styles = `
  .anyfile-pixelmator-pxd-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-pixelmator-pxd-viewer__toolbar { display:flex; min-height:48px; flex:none; align-items:center; gap:8px; overflow-x:auto; padding:8px 12px; border-bottom:1px solid var(--viewer-border,#ddd); background:var(--viewer-background,#fff); font-size:13px; }
  .anyfile-pixelmator-pxd-viewer__identity { min-width:120px; margin-right:auto; overflow:hidden; }
  .anyfile-pixelmator-pxd-viewer__name { display:block; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-pixelmator-pxd-viewer__meta { display:block; margin-top:2px; color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent); font-size:11px; white-space:nowrap; }
  .anyfile-pixelmator-pxd-viewer__controls { display:flex; align-items:center; gap:6px; white-space:nowrap; }
  .anyfile-pixelmator-pxd-viewer button { height:32px; min-width:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 9px; font:inherit; }
  .anyfile-pixelmator-pxd-viewer button:hover { background:color-mix(in srgb,var(--viewer-background,#fff) 92%,var(--viewer-foreground,#111)); }
  .anyfile-pixelmator-pxd-viewer button:focus-visible { outline:2px solid var(--viewer-accent,#2563eb); outline-offset:1px; }
  .anyfile-pixelmator-pxd-viewer__zoom { display:inline-block; width:48px; text-align:center; font-variant-numeric:tabular-nums; }
  .anyfile-pixelmator-pxd-viewer__viewport { position:relative; min-height:0; flex:1; overflow:hidden; overscroll-behavior:contain; background:repeating-conic-gradient(#e7e9ec 0 25%,#f7f8f9 0 50%) 50%/20px 20px; touch-action:none; cursor:grab; user-select:none; }
  .anyfile-pixelmator-pxd-viewer__viewport[data-dragging=true] { cursor:grabbing; }
  .anyfile-pixelmator-pxd-viewer__canvas { display:block; width:100%; height:100%; }
  @media (max-width:640px) { .anyfile-pixelmator-pxd-viewer__toolbar { align-items:flex-start; flex-wrap:wrap; } .anyfile-pixelmator-pxd-viewer__identity { width:100%; } .anyfile-pixelmator-pxd-viewer__name { max-width:100%; } }
`;

function button(label: string, text: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.title = label;
  element.textContent = text;
  return element;
}

export function createPxdViewerElements(
  fileName: string,
  previewFormat: string,
  width: number,
  height: number,
  locale: Locale,
): PxdViewerElements {
  const copy = selectMessages(locale, {
    en: { tools: "Pixelmator preview viewing tools", preview: "flattened Quick Look preview", zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit", actual: "Actual size", rotateLeft: "Rotate left", rotateRight: "Rotate right", canvas: "Pixelmator preview canvas, draggable and zoomable" },
    "zh-CN": { tools: "Pixelmator 预览查看工具", preview: "扁平化 Quick Look 预览", zoomOut: "缩小", zoomIn: "放大", fit: "适合窗口", actual: "实际大小", rotateLeft: "向左旋转", rotateRight: "向右旋转", canvas: "Pixelmator 预览画布，可拖动和缩放" },
  });
  const root = document.createElement("div");
  root.className = "anyfile-pixelmator-pxd-viewer";
  const style = document.createElement("style");
  style.textContent = styles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-pixelmator-pxd-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", copy.tools);
  const identity = document.createElement("div");
  identity.className = "anyfile-pixelmator-pxd-viewer__identity";
  const name = document.createElement("strong");
  name.className = "anyfile-pixelmator-pxd-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const metadata = document.createElement("span");
  metadata.className = "anyfile-pixelmator-pxd-viewer__meta";
  metadata.textContent = `PXD · ${copy.preview} · ${previewFormat} · ${width} × ${height}`;
  identity.append(name, metadata);
  const controls = document.createElement("div");
  controls.className = "anyfile-pixelmator-pxd-viewer__controls";
  const zoomOut = button(copy.zoomOut, "−");
  const zoomValue = document.createElement("output");
  zoomValue.className = "anyfile-pixelmator-pxd-viewer__zoom";
  zoomValue.setAttribute("aria-live", "polite");
  const zoomIn = button(copy.zoomIn, "+");
  const fit = button(copy.fit, copy.fit);
  const actual = button(copy.actual, "1:1");
  const rotateLeft = button(copy.rotateLeft, "↺");
  const rotateRight = button(copy.rotateRight, "↻");
  controls.append(zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight);
  const viewport = document.createElement("div");
  viewport.className = "anyfile-pixelmator-pxd-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", copy.canvas);
  const canvas = document.createElement("canvas");
  canvas.className = "anyfile-pixelmator-pxd-viewer__canvas";
  viewport.append(canvas);
  toolbar.append(identity, controls);
  root.append(style, toolbar, viewport);
  return { root, viewport, canvas, zoomValue, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual };
}

export class PxdPreviewViewport {
  private readonly surface: CanvasSurface;
  private readonly viewport: InteractiveViewport;
  private transform: ViewTransform = { scale: 1, rotation: 0, panX: 0, panY: 0 };
  private disposed = false;

  constructor(private readonly elements: PxdViewerElements, private readonly bitmap: ImageBitmap) {
    if (!elements.canvas.getContext("2d", { alpha: true })) throw new Error("Canvas 2D is unavailable.");
    this.surface = new CanvasSurface(elements.canvas, elements.viewport, (context, width, height, dpr) => this.draw(context, width, height, dpr));
    this.viewport = new InteractiveViewport(elements, bitmap.width, bitmap.height, (transform) => {
      this.transform = transform;
      this.surface.schedule();
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.viewport.dispose();
    this.surface.dispose();
    this.bitmap.close();
  }

  private draw(context: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    if (this.disposed) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.translate(width / 2 + this.transform.panX, height / 2 + this.transform.panY);
    context.rotate((this.transform.rotation * Math.PI) / 180);
    context.scale(this.transform.scale, this.transform.scale);
    context.drawImage(this.bitmap, -this.bitmap.width / 2, -this.bitmap.height / 2);
  }
}
