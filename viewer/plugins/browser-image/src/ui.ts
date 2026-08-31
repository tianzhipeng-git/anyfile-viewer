import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { ImageFileInfo } from "./format";

export interface ImageViewerElements {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly image: HTMLImageElement;
  readonly zoomValue: HTMLOutputElement;
  readonly rotateLeft: HTMLButtonElement;
  readonly rotateRight: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly fit: HTMLButtonElement;
  readonly actual: HTMLButtonElement;
}

const styles = `
  .anyfile-browser-image-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-browser-image-viewer__toolbar { display:flex; min-height:48px; flex:none; align-items:center; gap:8px; overflow-x:auto; padding:8px 12px; border-bottom:1px solid var(--viewer-border,#ddd); background:var(--viewer-background,#fff); font-size:13px; }
  .anyfile-browser-image-viewer__identity { min-width:120px; margin-right:auto; overflow:hidden; }
  .anyfile-browser-image-viewer__name { display:block; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-browser-image-viewer__meta { display:block; margin-top:2px; color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent); font-size:11px; white-space:nowrap; }
  .anyfile-browser-image-viewer__controls { display:flex; align-items:center; gap:6px; white-space:nowrap; }
  .anyfile-browser-image-viewer button { height:32px; min-width:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 9px; font:inherit; }
  .anyfile-browser-image-viewer button:hover { background:color-mix(in srgb,var(--viewer-background,#fff) 92%,var(--viewer-foreground,#111)); }
  .anyfile-browser-image-viewer button:focus-visible { outline:2px solid var(--viewer-accent,#2563eb); outline-offset:1px; }
  .anyfile-browser-image-viewer__zoom { display:inline-block; width:48px; text-align:center; font-variant-numeric:tabular-nums; }
  .anyfile-browser-image-viewer__viewport { position:relative; min-height:0; flex:1; overflow:hidden; overscroll-behavior:contain; background:repeating-conic-gradient(#e7e9ec 0 25%,#f7f8f9 0 50%) 50%/20px 20px; touch-action:none; cursor:grab; user-select:none; }
  .anyfile-browser-image-viewer__viewport[data-dragging=true] { cursor:grabbing; }
  .anyfile-browser-image-viewer__image { position:absolute; left:50%; top:50%; display:block; max-width:none; max-height:none; transform-origin:center; image-orientation:from-image; box-shadow:0 8px 30px rgb(0 0 0 / .18); pointer-events:none; }
  @media (max-width:640px) {
    .anyfile-browser-image-viewer__toolbar { align-items:flex-start; flex-wrap:wrap; }
    .anyfile-browser-image-viewer__identity { width:100%; }
    .anyfile-browser-image-viewer__name { max-width:100%; }
    .anyfile-browser-image-viewer__controls { width:max-content; }
  }
`;

function button(label: string, text: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.title = label;
  element.textContent = text;
  return element;
}

export function createImageViewerElements(
  fileName: string,
  info: ImageFileInfo,
  width: number,
  height: number,
  locale: Locale,
  imageElement?: HTMLImageElement,
): ImageViewerElements {
  const copy = selectMessages(locale, {
    en: { tools: "Image viewing tools", frames: "frames", animated: "animated", alpha: "alpha", orientation: "orientation", zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit", actual: "Actual size", rotateLeft: "Rotate left", rotateRight: "Rotate right", canvas: "Image canvas, draggable and zoomable" },
    "zh-CN": { tools: "图片查看工具", frames: "帧", animated: "动画", alpha: "透明通道", orientation: "方向", zoomOut: "缩小", zoomIn: "放大", fit: "适合窗口", actual: "实际大小", rotateLeft: "向左旋转", rotateRight: "向右旋转", canvas: "图片画布，可拖动和缩放" },
  });
  const root = document.createElement("div");
  root.className = "anyfile-browser-image-viewer";
  const style = document.createElement("style");
  style.textContent = styles;

  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-browser-image-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", copy.tools);
  const identity = document.createElement("div");
  identity.className = "anyfile-browser-image-viewer__identity";
  const name = document.createElement("strong");
  name.className = "anyfile-browser-image-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const metadata = document.createElement("span");
  metadata.className = "anyfile-browser-image-viewer__meta";
  const details = [info.format, `${width} × ${height}`];
  if (info.animated) details.push(info.frameCount ? `${info.frameCount} ${copy.frames}` : copy.animated);
  if (info.hasAlpha) details.push(copy.alpha);
  if (info.orientation && info.orientation !== 1) details.push(`EXIF ${copy.orientation} ${info.orientation}`);
  metadata.textContent = details.join(" · ");
  identity.append(name, metadata);

  const controls = document.createElement("div");
  controls.className = "anyfile-browser-image-viewer__controls";
  const zoomOut = button(copy.zoomOut, "−");
  const zoomValue = document.createElement("output");
  zoomValue.className = "anyfile-browser-image-viewer__zoom";
  zoomValue.setAttribute("aria-live", "polite");
  const zoomIn = button(copy.zoomIn, "+");
  const fit = button(copy.fit, copy.fit);
  const actual = button(copy.actual, "1:1");
  const rotateLeft = button(copy.rotateLeft, "↺");
  const rotateRight = button(copy.rotateRight, "↻");
  controls.append(zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight);

  const viewport = document.createElement("div");
  viewport.className = "anyfile-browser-image-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", copy.canvas);
  const image = imageElement ?? document.createElement("img");
  image.className = "anyfile-browser-image-viewer__image";
  image.alt = fileName;
  image.draggable = false;
  viewport.append(image);
  toolbar.append(identity, controls);
  root.append(style, toolbar, viewport);

  return { root, viewport, image, zoomValue, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual };
}
