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
  .anyfile-image-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-image-viewer__toolbar { display:flex; min-height:48px; flex:none; align-items:center; gap:8px; overflow-x:auto; padding:8px 12px; border-bottom:1px solid var(--viewer-border,#ddd); background:var(--viewer-background,#fff); font-size:13px; }
  .anyfile-image-viewer__identity { min-width:120px; margin-right:auto; overflow:hidden; }
  .anyfile-image-viewer__name { display:block; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-image-viewer__meta { display:block; margin-top:2px; color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent); font-size:11px; white-space:nowrap; }
  .anyfile-image-viewer__controls { display:flex; align-items:center; gap:6px; white-space:nowrap; }
  .anyfile-image-viewer button { height:32px; min-width:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 9px; font:inherit; }
  .anyfile-image-viewer button:hover { background:color-mix(in srgb,var(--viewer-background,#fff) 92%,var(--viewer-foreground,#111)); }
  .anyfile-image-viewer button:focus-visible { outline:2px solid var(--viewer-accent,#2563eb); outline-offset:1px; }
  .anyfile-image-viewer__zoom { display:inline-block; width:48px; text-align:center; font-variant-numeric:tabular-nums; }
  .anyfile-image-viewer__viewport { position:relative; min-height:0; flex:1; overflow:hidden; overscroll-behavior:contain; background:repeating-conic-gradient(#e7e9ec 0 25%,#f7f8f9 0 50%) 50%/20px 20px; touch-action:none; cursor:grab; user-select:none; }
  .anyfile-image-viewer__viewport[data-dragging=true] { cursor:grabbing; }
  .anyfile-image-viewer__image { position:absolute; left:50%; top:50%; display:block; max-width:none; max-height:none; transform-origin:center; image-orientation:from-image; box-shadow:0 8px 30px rgb(0 0 0 / .18); pointer-events:none; }
  @media (max-width:640px) {
    .anyfile-image-viewer__toolbar { align-items:flex-start; flex-wrap:wrap; }
    .anyfile-image-viewer__identity { width:100%; }
    .anyfile-image-viewer__name { max-width:100%; }
    .anyfile-image-viewer__controls { width:max-content; }
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
  locale: string,
  imageElement?: HTMLImageElement,
): ImageViewerElements {
  const chinese = locale.toLowerCase().startsWith("zh");
  const root = document.createElement("div");
  root.className = "anyfile-image-viewer";
  const style = document.createElement("style");
  style.textContent = styles;

  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-image-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", chinese ? "图片查看工具" : "Image viewing tools");
  const identity = document.createElement("div");
  identity.className = "anyfile-image-viewer__identity";
  const name = document.createElement("strong");
  name.className = "anyfile-image-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const metadata = document.createElement("span");
  metadata.className = "anyfile-image-viewer__meta";
  const details = [info.format, `${width} × ${height}`];
  if (info.animated) details.push(info.frameCount ? `${info.frameCount} ${chinese ? "帧" : "frames"}` : (chinese ? "动画" : "animated"));
  if (info.hasAlpha) details.push(chinese ? "透明通道" : "alpha");
  if (info.orientation && info.orientation !== 1) details.push(`EXIF ${chinese ? "方向" : "orientation"} ${info.orientation}`);
  metadata.textContent = details.join(" · ");
  identity.append(name, metadata);

  const controls = document.createElement("div");
  controls.className = "anyfile-image-viewer__controls";
  const zoomOut = button(chinese ? "缩小" : "Zoom out", "−");
  const zoomValue = document.createElement("output");
  zoomValue.className = "anyfile-image-viewer__zoom";
  zoomValue.setAttribute("aria-live", "polite");
  const zoomIn = button(chinese ? "放大" : "Zoom in", "+");
  const fit = button(chinese ? "适合窗口" : "Fit", chinese ? "适合" : "Fit");
  const actual = button(chinese ? "实际大小" : "Actual size", "1:1");
  const rotateLeft = button(chinese ? "向左旋转" : "Rotate left", "↺");
  const rotateRight = button(chinese ? "向右旋转" : "Rotate right", "↻");
  controls.append(zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight);

  const viewport = document.createElement("div");
  viewport.className = "anyfile-image-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", chinese ? "图片画布，可拖动和缩放" : "Image canvas, draggable and zoomable");
  const image = imageElement ?? document.createElement("img");
  image.className = "anyfile-image-viewer__image";
  image.alt = fileName;
  image.draggable = false;
  viewport.append(image);
  toolbar.append(identity, controls);
  root.append(style, toolbar, viewport);

  return { root, viewport, image, zoomValue, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual };
}
