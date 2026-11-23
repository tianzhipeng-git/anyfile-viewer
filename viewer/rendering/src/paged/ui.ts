import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import type { PagedViewportCopy } from "./types";

export function pagedViewportCopy(locale: Locale): PagedViewportCopy {
  return selectMessages(locale, {
    en: {
      page: "Page",
      previousPage: "Previous page",
      nextPage: "Next page",
      zoomOut: "Zoom out",
      zoomIn: "Zoom in",
      fitWidth: "Fit width",
      fitPage: "Fit page",
      sidebar: "Contents",
      outline: "Outline",
      thumbnails: "Thumbnails",
      noOutline: "This document has no outline.",
      textLayerOn: "Text layer",
      renderFailed: "Unable to render this page.",
      pageCountSuffix: (count: number) => `${count} ${count === 1 ? "page" : "pages"}`,
    },
    "zh-CN": {
      page: "第",
      previousPage: "上一页",
      nextPage: "下一页",
      zoomOut: "缩小",
      zoomIn: "放大",
      fitWidth: "适应宽度",
      fitPage: "适应页面",
      sidebar: "导航",
      outline: "目录",
      thumbnails: "缩略图",
      noOutline: "该文档不包含目录。",
      textLayerOn: "文本层",
      renderFailed: "无法渲染该页面。",
      pageCountSuffix: (count: number) => `${count} 页`,
    },
  });
}

export function createToolbarButton(label: string, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

export const PAGED_VIEWER_STYLES = `
.anyfile-paged-viewer {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: var(--viewer-surface, #e7e9ee);
  color: var(--viewer-foreground, #111827);
  font-family: var(--viewer-font-family, system-ui, sans-serif);
}
.anyfile-paged-viewer__toolbar {
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  min-height: 48px;
  padding: 8px 12px;
  flex: none;
  border-bottom: 1px solid var(--viewer-border, #d1d5db);
  background: var(--viewer-background, #ffffff);
}
.anyfile-paged-viewer__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 140px;
}
.anyfile-paged-viewer__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.anyfile-paged-viewer__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.anyfile-paged-viewer button,
.anyfile-paged-viewer input {
  box-sizing: border-box;
  height: 30px;
  border: 1px solid var(--viewer-border, #d1d5db);
  border-radius: 6px;
  background: var(--viewer-background, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 12px;
}
.anyfile-paged-viewer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  padding: 0 8px;
  cursor: pointer;
}
.anyfile-paged-viewer button[hidden] {
  display: none;
}
.anyfile-paged-viewer button[aria-pressed="true"],
.anyfile-paged-viewer button[aria-selected="true"] {
  border-color: var(--viewer-accent, #2563eb);
  color: var(--viewer-accent, #2563eb);
}
.anyfile-paged-viewer button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.anyfile-paged-viewer button:focus-visible,
.anyfile-paged-viewer input:focus-visible,
.anyfile-paged-viewer__viewport:focus-visible {
  outline: 2px solid var(--viewer-accent, #2563eb);
  outline-offset: 1px;
}
.anyfile-paged-viewer__page-input {
  width: 54px;
  padding: 0 6px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.anyfile-paged-viewer__page-total,
.anyfile-paged-viewer__zoom {
  font-size: 12px;
  color: var(--viewer-muted, color-mix(in srgb, var(--viewer-foreground, #111827) 62%, transparent));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.anyfile-paged-viewer__zoom {
  min-width: 44px;
  text-align: center;
}
.anyfile-paged-viewer__body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.anyfile-paged-viewer__sidebar {
  display: flex;
  flex-direction: column;
  width: 240px;
  max-width: 75vw;
  flex: none;
  min-height: 0;
  border-right: 1px solid var(--viewer-border, #d1d5db);
  background: var(--viewer-background, #ffffff);
}
.anyfile-paged-viewer__sidebar[hidden] {
  display: none;
}
.anyfile-paged-viewer__tabs {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--viewer-border, #d1d5db);
}
.anyfile-paged-viewer__tabs[hidden] {
  display: none;
}
.anyfile-paged-viewer__tabs button {
  flex: 1;
}
.anyfile-paged-viewer__panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.anyfile-paged-viewer__panel[hidden] {
  display: none;
}
.anyfile-paged-viewer__empty {
  margin: 8px;
  font-size: 12px;
  color: var(--viewer-muted, color-mix(in srgb, var(--viewer-foreground, #111827) 62%, transparent));
}
.anyfile-paged-viewer__outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.anyfile-paged-viewer__outline-list .anyfile-paged-viewer__outline-list {
  padding-left: 12px;
}
.anyfile-paged-viewer__outline-btn {
  width: 100%;
  height: auto !important;
  min-height: 28px;
  justify-content: flex-start !important;
  text-align: left;
  padding: 4px 8px !important;
  border-color: transparent !important;
  background: transparent !important;
  line-height: 1.35;
}
.anyfile-paged-viewer__outline-btn:hover {
  background: var(--viewer-surface, color-mix(in srgb, var(--viewer-foreground, #111827) 8%, transparent)) !important;
}
.anyfile-paged-viewer__outline-btn[aria-current="page"] {
  color: var(--viewer-accent, #2563eb);
  font-weight: 600;
}
.anyfile-paged-viewer__thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
}
.anyfile-paged-viewer__thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: auto !important;
  padding: 6px !important;
  border-radius: 8px;
}
.anyfile-paged-viewer__thumb[data-active="true"] {
  border-color: var(--viewer-accent, #2563eb);
}
.anyfile-paged-viewer__thumb canvas {
  display: block;
  max-width: 100%;
  background: #ffffff;
  border: 1px solid var(--viewer-border, #d1d5db);
}
.anyfile-paged-viewer__viewport {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.anyfile-paged-viewer__status {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 24px;
  color: var(--viewer-muted, color-mix(in srgb, var(--viewer-foreground, #111827) 62%, transparent));
  font-size: 13px;
  text-align: center;
}
.anyfile-paged-viewer__status[hidden] {
  display: none;
}
.anyfile-paged-viewer__status[role="alert"] {
  color: var(--viewer-danger, #dc2626);
}
.anyfile-paged-viewer__pages {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: max-content;
  min-width: 100%;
  padding: 20px 16px;
}
.anyfile-paged-viewer__pages[hidden] {
  display: none;
}
.anyfile-paged-viewer__page {
  position: relative;
  flex: none;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 2px 8px rgb(15 23 42 / 14%);
}
.anyfile-paged-viewer__page canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.anyfile-paged-viewer__text-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  user-select: text;
  pointer-events: auto;
}
.anyfile-paged-viewer__text-layer[hidden] {
  display: none;
}
.anyfile-paged-viewer__text-word {
  position: absolute;
  color: transparent;
  white-space: pre;
  line-height: 1;
  transform-origin: 0 0;
  cursor: text;
}
.anyfile-paged-viewer__text-word::selection {
  background: color-mix(in srgb, var(--viewer-accent, #2563eb) 26%, transparent);
  color: transparent;
}
.anyfile-paged-viewer__page-badge {
  position: absolute;
  right: 8px;
  bottom: 7px;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgb(15 23 42 / 68%);
  color: #ffffff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.anyfile-paged-viewer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 12px;
  flex: none;
  border-top: 1px solid var(--viewer-border, #d1d5db);
  background: var(--viewer-background, #ffffff);
  font-size: 12px;
}
.anyfile-paged-viewer__footer[hidden] {
  display: none;
}
.anyfile-paged-viewer__source {
  color: var(--viewer-accent, #2563eb);
  text-decoration: none;
}
.anyfile-paged-viewer__source:hover {
  text-decoration: underline;
}
.anyfile-paged-viewer__error {
  margin: 16px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--viewer-danger, #dc2626) 40%, var(--viewer-border, #d1d5db));
  border-radius: 8px;
  background: color-mix(in srgb, var(--viewer-danger, #dc2626) 10%, var(--viewer-background, #ffffff));
  color: var(--viewer-danger, #dc2626);
  font-size: 13px;
}
@media (max-width: 720px) {
  .anyfile-paged-viewer__sidebar {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 3;
    box-shadow: 4px 0 18px rgb(15 23 42 / 18%);
  }
  .anyfile-paged-viewer__pages {
    padding: 12px 8px;
  }
}
`;
