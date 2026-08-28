import type { DecodedRaster } from "./types";

export interface RasterViewerElements {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly metadata: HTMLSpanElement;
  readonly zoomValue: HTMLOutputElement;
  readonly pageLabel: HTMLLabelElement;
  readonly pageSelect: HTMLSelectElement;
  readonly status: HTMLSpanElement;
  readonly rotateLeft: HTMLButtonElement;
  readonly rotateRight: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly fit: HTMLButtonElement;
  readonly actual: HTMLButtonElement;
}

const styles = `
  .anyfile-general-raster-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-general-raster-viewer__toolbar { display:flex; min-height:48px; flex:none; align-items:center; gap:8px; overflow-x:auto; padding:8px 12px; border-bottom:1px solid var(--viewer-border,#ddd); background:var(--viewer-background,#fff); font-size:13px; }
  .anyfile-general-raster-viewer__identity { min-width:120px; margin-right:auto; overflow:hidden; }
  .anyfile-general-raster-viewer__name { display:block; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-general-raster-viewer__meta { display:block; margin-top:2px; color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent); font-size:11px; white-space:nowrap; }
  .anyfile-general-raster-viewer__controls { display:flex; align-items:center; gap:6px; white-space:nowrap; }
  .anyfile-general-raster-viewer button,.anyfile-general-raster-viewer select { height:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 9px; font:inherit; }
  .anyfile-general-raster-viewer button { min-width:32px; }
  .anyfile-general-raster-viewer button:hover { background:color-mix(in srgb,var(--viewer-background,#fff) 92%,var(--viewer-foreground,#111)); }
  .anyfile-general-raster-viewer button:focus-visible,.anyfile-general-raster-viewer select:focus-visible { outline:2px solid var(--viewer-accent,#2563eb); outline-offset:1px; }
  .anyfile-general-raster-viewer__zoom { display:inline-block; width:48px; text-align:center; font-variant-numeric:tabular-nums; }
  .anyfile-general-raster-viewer__page { display:flex; align-items:center; gap:5px; }
  .anyfile-general-raster-viewer__status { color:color-mix(in srgb,var(--viewer-foreground,#111) 65%,transparent); }
  .anyfile-general-raster-viewer__viewport { position:relative; min-height:0; flex:1; overflow:hidden; overscroll-behavior:contain; background:repeating-conic-gradient(#e7e9ec 0 25%,#f7f8f9 0 50%) 50%/20px 20px; touch-action:none; cursor:grab; user-select:none; }
  .anyfile-general-raster-viewer__viewport[data-dragging=true] { cursor:grabbing; }
  .anyfile-general-raster-viewer__canvas { display:block; width:100%; height:100%; }
  @media (max-width:720px) {
    .anyfile-general-raster-viewer__toolbar { align-items:flex-start; flex-wrap:wrap; }
    .anyfile-general-raster-viewer__identity { width:100%; }
    .anyfile-general-raster-viewer__name { max-width:100%; }
    .anyfile-general-raster-viewer__controls { width:max-content; }
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

export function createRasterViewerElements(fileName: string, locale: string): RasterViewerElements {
  const chinese = locale.toLowerCase().startsWith("zh");
  const root = document.createElement("div");
  root.className = "anyfile-general-raster-viewer";
  const style = document.createElement("style");
  style.textContent = styles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-general-raster-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", chinese ? "栅格图片查看工具" : "Raster image viewing tools");
  const identity = document.createElement("div");
  identity.className = "anyfile-general-raster-viewer__identity";
  const name = document.createElement("strong");
  name.className = "anyfile-general-raster-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const metadata = document.createElement("span");
  metadata.className = "anyfile-general-raster-viewer__meta";
  identity.append(name, metadata);

  const controls = document.createElement("div");
  controls.className = "anyfile-general-raster-viewer__controls";
  const pageLabel = document.createElement("label");
  pageLabel.className = "anyfile-general-raster-viewer__page";
  pageLabel.textContent = chinese ? "页面" : "Page";
  const pageSelect = document.createElement("select");
  pageSelect.setAttribute("aria-label", chinese ? "选择 TIFF 页面" : "Select TIFF page");
  pageLabel.append(pageSelect);
  const zoomOut = button(chinese ? "缩小" : "Zoom out", "−");
  const zoomValue = document.createElement("output");
  zoomValue.className = "anyfile-general-raster-viewer__zoom";
  zoomValue.setAttribute("aria-live", "polite");
  const zoomIn = button(chinese ? "放大" : "Zoom in", "+");
  const fit = button(chinese ? "适合窗口" : "Fit", chinese ? "适合" : "Fit");
  const actual = button(chinese ? "实际大小" : "Actual size", "1:1");
  const rotateLeft = button(chinese ? "向左旋转" : "Rotate left", "↺");
  const rotateRight = button(chinese ? "向右旋转" : "Rotate right", "↻");
  const status = document.createElement("span");
  status.className = "anyfile-general-raster-viewer__status";
  status.setAttribute("role", "status");
  controls.append(pageLabel, zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight, status);

  const viewport = document.createElement("div");
  viewport.className = "anyfile-general-raster-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", chinese ? "栅格图片画布，可拖动和缩放" : "Raster image canvas, draggable and zoomable");
  const canvas = document.createElement("canvas");
  canvas.className = "anyfile-general-raster-viewer__canvas";
  viewport.append(canvas);
  toolbar.append(identity, controls);
  root.append(style, toolbar, viewport);
  return { root, viewport, canvas, metadata, zoomValue, pageLabel, pageSelect, status, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual };
}

export function updateRasterMetadata(elements: RasterViewerElements, raster: DecodedRaster, locale: string) {
  const chinese = locale.toLowerCase().startsWith("zh");
  const details = [raster.format, `${raster.width} × ${raster.height}`, `${raster.bitDepth} bit`];
  if (raster.hasAlpha) details.push(chinese ? "透明通道" : "alpha");
  if (raster.compression) details.push(raster.compression);
  if (raster.tiled) details.push(chinese ? "分块" : "tiled");
  if (raster.orientation !== 1) details.push(`${chinese ? "方向" : "orientation"} ${raster.orientation}`);
  if (raster.icc === "preserved-not-applied") details.push(chinese ? "ICC 未应用" : "ICC not applied");
  elements.metadata.textContent = details.join(" · ");
  elements.pageLabel.hidden = raster.pageCount <= 1;
  if (elements.pageSelect.options.length !== raster.pageCount) {
    elements.pageSelect.replaceChildren(...Array.from({ length: raster.pageCount }, (_, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${index + 1} / ${raster.pageCount}`;
      return option;
    }));
  }
  elements.pageSelect.value = String(raster.pageIndex);
}
