import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { ModernRasterInfo } from "./types";

export interface ModernRasterElements {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly metadata: HTMLSpanElement;
  readonly status: HTMLSpanElement;
  readonly zoomValue: HTMLOutputElement;
  readonly rotateLeft: HTMLButtonElement;
  readonly rotateRight: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly fit: HTMLButtonElement;
  readonly actual: HTMLButtonElement;
}

const styles = `
  .anyfile-modern-raster-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui)}
  .anyfile-modern-raster-viewer__toolbar{display:flex;min-height:48px;flex:none;align-items:center;gap:8px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid var(--viewer-border,#ddd);font-size:13px}
  .anyfile-modern-raster-viewer__identity{min-width:120px;margin-right:auto;overflow:hidden}.anyfile-modern-raster-viewer__name{display:block;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .anyfile-modern-raster-viewer__meta{display:block;margin-top:2px;color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent);font-size:11px;white-space:nowrap}
  .anyfile-modern-raster-viewer__controls{display:flex;align-items:center;gap:6px;white-space:nowrap}.anyfile-modern-raster-viewer button{height:32px;min-width:32px;border:1px solid var(--viewer-border,#ddd);border-radius:7px;background:var(--viewer-background,#fff);color:inherit;padding:0 9px;font:inherit}
  .anyfile-modern-raster-viewer button:focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:1px}.anyfile-modern-raster-viewer__zoom{display:inline-block;width:48px;text-align:center}.anyfile-modern-raster-viewer__status{color:color-mix(in srgb,var(--viewer-foreground,#111) 65%,transparent)}
  .anyfile-modern-raster-viewer__viewport{position:relative;min-height:0;flex:1;overflow:hidden;overscroll-behavior:contain;background:repeating-conic-gradient(#e7e9ec 0 25%,#f7f8f9 0 50%) 50%/20px 20px;touch-action:none;cursor:grab;user-select:none}.anyfile-modern-raster-viewer__viewport[data-dragging=true]{cursor:grabbing}.anyfile-modern-raster-viewer__canvas{display:block;width:100%;height:100%}
  @media(max-width:720px){.anyfile-modern-raster-viewer__toolbar{align-items:flex-start;flex-wrap:wrap}.anyfile-modern-raster-viewer__identity{width:100%}.anyfile-modern-raster-viewer__name{max-width:100%}}
`;

function button(label: string, text: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.title = label;
  element.textContent = text;
  return element;
}

export function createModernRasterElements(fileName: string, locale: Locale): ModernRasterElements {
  const copy = selectMessages(locale, {
    en: { zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit", actual: "Actual size", rotateLeft: "Rotate left", rotateRight: "Rotate right", canvas: "Image canvas, draggable and zoomable" },
    "zh-CN": { zoomOut: "缩小", zoomIn: "放大", fit: "适合窗口", actual: "实际大小", rotateLeft: "向左旋转", rotateRight: "向右旋转", canvas: "图片画布，可拖动和缩放" },
  });
  const root = document.createElement("div"); root.className = "anyfile-modern-raster-viewer";
  const style = document.createElement("style"); style.textContent = styles;
  const toolbar = document.createElement("div"); toolbar.className = "anyfile-modern-raster-viewer__toolbar"; toolbar.setAttribute("role", "toolbar");
  const identity = document.createElement("div"); identity.className = "anyfile-modern-raster-viewer__identity";
  const name = document.createElement("strong"); name.className = "anyfile-modern-raster-viewer__name"; name.textContent = fileName; name.title = fileName;
  const metadata = document.createElement("span"); metadata.className = "anyfile-modern-raster-viewer__meta"; identity.append(name, metadata);
  const controls = document.createElement("div"); controls.className = "anyfile-modern-raster-viewer__controls";
  const zoomOut = button(copy.zoomOut, "−"); const zoomValue = document.createElement("output"); zoomValue.className = "anyfile-modern-raster-viewer__zoom";
  const zoomIn = button(copy.zoomIn, "+"); const fit = button(copy.fit, copy.fit); const actual = button(copy.actual, "1:1");
  const rotateLeft = button(copy.rotateLeft, "↺"); const rotateRight = button(copy.rotateRight, "↻");
  const status = document.createElement("span"); status.className = "anyfile-modern-raster-viewer__status"; status.setAttribute("role", "status"); controls.append(zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight, status);
  const viewport = document.createElement("div"); viewport.className = "anyfile-modern-raster-viewer__viewport"; viewport.tabIndex = 0; viewport.setAttribute("aria-label", copy.canvas);
  const canvas = document.createElement("canvas"); canvas.className = "anyfile-modern-raster-viewer__canvas"; viewport.append(canvas); toolbar.append(identity, controls); root.append(style, toolbar, viewport);
  return { root, viewport, canvas, metadata, status, zoomValue, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual };
}

export function updateModernMetadata(elements: ModernRasterElements, info: ModernRasterInfo, locale: Locale) {
  const copy = selectMessages(locale, { en: { frames: "frames" }, "zh-CN": { frames: "帧" } });
  const details = [info.format, `${info.width} × ${info.height}`];
  if (info.animated) details.push(`${info.frameCount} ${copy.frames}`);
  if (info.note) details.push(info.note);
  elements.metadata.textContent = details.join(" · ");
}
