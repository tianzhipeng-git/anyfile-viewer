import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { RawMetadataSummary } from "./raw-decoder";

export interface CameraRawElements {
  readonly root: HTMLDivElement; readonly viewport: HTMLDivElement; readonly canvas: HTMLCanvasElement; readonly metadata: HTMLSpanElement; readonly status: HTMLSpanElement;
  readonly preview: HTMLButtonElement; readonly developed: HTMLButtonElement; readonly zoomValue: HTMLOutputElement; readonly rotateLeft: HTMLButtonElement; readonly rotateRight: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement; readonly zoomOut: HTMLButtonElement; readonly fit: HTMLButtonElement; readonly actual: HTMLButtonElement;
}

const styles = `
  .anyfile-camera-raw-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui)}
  .anyfile-camera-raw-viewer__toolbar{display:flex;min-height:48px;flex:none;align-items:center;gap:8px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid var(--viewer-border,#ddd);font-size:13px}.anyfile-camera-raw-viewer__identity{min-width:120px;margin-right:auto;overflow:hidden}.anyfile-camera-raw-viewer__name{display:block;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.anyfile-camera-raw-viewer__meta{display:block;margin-top:2px;color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent);font-size:11px;white-space:nowrap}
  .anyfile-camera-raw-viewer__controls{display:flex;align-items:center;gap:6px;white-space:nowrap}.anyfile-camera-raw-viewer button{height:32px;min-width:32px;border:1px solid var(--viewer-border,#ddd);border-radius:7px;background:var(--viewer-background,#fff);color:inherit;padding:0 9px;font:inherit}.anyfile-camera-raw-viewer button[aria-pressed=true]{border-color:var(--viewer-accent,#2563eb);color:var(--viewer-accent,#2563eb)}.anyfile-camera-raw-viewer button:focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:1px}.anyfile-camera-raw-viewer__zoom{display:inline-block;width:48px;text-align:center}.anyfile-camera-raw-viewer__status{color:color-mix(in srgb,var(--viewer-foreground,#111) 65%,transparent)}
  .anyfile-camera-raw-viewer__viewport{position:relative;min-height:0;flex:1;overflow:hidden;background:repeating-conic-gradient(#e7e9ec 0 25%,#f7f8f9 0 50%) 50%/20px 20px;touch-action:none;cursor:grab;user-select:none}.anyfile-camera-raw-viewer__viewport[data-dragging=true]{cursor:grabbing}.anyfile-camera-raw-viewer__canvas{display:block;width:100%;height:100%}
  @media(max-width:800px){.anyfile-camera-raw-viewer__toolbar{align-items:flex-start;flex-wrap:wrap}.anyfile-camera-raw-viewer__identity{width:100%}.anyfile-camera-raw-viewer__name{max-width:100%}}
`;

function button(label: string, text = label) { const element = document.createElement("button"); element.type = "button"; element.setAttribute("aria-label", label); element.title = label; element.textContent = text; return element; }

export function createCameraRawElements(fileName: string, locale: Locale): CameraRawElements {
  const copy = selectMessages(locale, {
    en: { preview: "Embedded preview", developed: "Basic RAW development", zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit", actual: "Actual size", rotateLeft: "Rotate left", rotateRight: "Rotate right" },
    "zh-CN": { preview: "内嵌预览", developed: "基础 RAW 显影", zoomOut: "缩小", zoomIn: "放大", fit: "适合窗口", actual: "实际大小", rotateLeft: "向左旋转", rotateRight: "向右旋转" },
  }); const root = document.createElement("div"); root.className = "anyfile-camera-raw-viewer"; const style = document.createElement("style"); style.textContent = styles;
  const toolbar = document.createElement("div"); toolbar.className = "anyfile-camera-raw-viewer__toolbar"; toolbar.setAttribute("role", "toolbar"); const identity = document.createElement("div"); identity.className = "anyfile-camera-raw-viewer__identity";
  const name = document.createElement("strong"); name.className = "anyfile-camera-raw-viewer__name"; name.textContent = fileName; name.title = fileName; const metadata = document.createElement("span"); metadata.className = "anyfile-camera-raw-viewer__meta"; identity.append(name, metadata);
  const controls = document.createElement("div"); controls.className = "anyfile-camera-raw-viewer__controls"; const preview = button(copy.preview); const developed = button(copy.developed); preview.hidden = true; developed.hidden = true;
  const zoomOut = button(copy.zoomOut, "−"); const zoomValue = document.createElement("output"); zoomValue.className = "anyfile-camera-raw-viewer__zoom"; const zoomIn = button(copy.zoomIn, "+"); const fit = button(copy.fit, copy.fit); const actual = button(copy.actual, "1:1"); const rotateLeft = button(copy.rotateLeft, "↺"); const rotateRight = button(copy.rotateRight, "↻"); const status = document.createElement("span"); status.className = "anyfile-camera-raw-viewer__status"; status.setAttribute("role", "status"); controls.append(preview, developed, zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight, status);
  const viewport = document.createElement("div"); viewport.className = "anyfile-camera-raw-viewer__viewport"; viewport.tabIndex = 0; const canvas = document.createElement("canvas"); canvas.className = "anyfile-camera-raw-viewer__canvas"; viewport.append(canvas); toolbar.append(identity, controls); root.append(style, toolbar, viewport);
  return { root, viewport, canvas, metadata, status, preview, developed, zoomValue, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual };
}

export function updateRawMetadata(elements: CameraRawElements, format: string, metadata: RawMetadataSummary) {
  elements.metadata.textContent = [format, metadata.make, metadata.model, metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : undefined, metadata.iso ? `ISO ${metadata.iso}` : undefined].filter(Boolean).join(" · ");
}
