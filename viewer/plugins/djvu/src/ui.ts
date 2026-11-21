import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export function djvuCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      loading: "Reading DjVu locally…",
      invalid: "The DjVu file is damaged or not a valid DjVu document.",
      indirect: "Indirect multi-file DjVu documents require linked external page files and are not supported.",
      limit: "DjVu resource limit reached (128 MiB file, 5,000 pages, or 16 Mi render pixels).",
      unsupported: "DjVu WebAssembly rendering is unavailable in this environment.",
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
      noOutline: "This DjVu document has no outline.",
      textLayerOn: "Text layer",
      renderFailed: "Unable to render this DjVu page.",
      sourceNotice: "DjVuLibre GPLv2+ source & notices",
    },
    "zh-CN": {
      loading: "正在本地读取 DjVu…",
      invalid: "DjVu 文件已损坏或不是有效的 DjVu 文档。",
      indirect: "不支持引用外部单页文件的 indirect 多文件 DjVu 文档。",
      limit: "达到 DjVu 资源上限（单文件 128 MiB、最多 5,000 页或单页 1,600 万渲染像素）。",
      unsupported: "当前环境不支持 DjVu WebAssembly 渲染。",
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
      noOutline: "该 DjVu 文档不包含目录。",
      textLayerOn: "文本层",
      renderFailed: "无法渲染该 DjVu 页面。",
      sourceNotice: "DjVuLibre GPLv2+ 源码与许可声明",
    },
  });
}

export type DjvuCopy = ReturnType<typeof djvuCopy>;

export const DJVU_VIEWER_STYLES = `
.anyfile-djvu-viewer {
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
.anyfile-djvu-viewer__toolbar {
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
.anyfile-djvu-viewer__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 140px;
}
.anyfile-djvu-viewer__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.anyfile-djvu-viewer__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.anyfile-djvu-viewer button,
.anyfile-djvu-viewer input {
  box-sizing: border-box;
  height: 30px;
  border: 1px solid var(--viewer-border, #d1d5db);
  border-radius: 6px;
  background: var(--viewer-background, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 12px;
}
.anyfile-djvu-viewer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  padding: 0 8px;
  cursor: pointer;
}
.anyfile-djvu-viewer button[aria-pressed="true"] {
  border-color: var(--viewer-accent, #2563eb);
  color: var(--viewer-accent, #2563eb);
}
.anyfile-djvu-viewer button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.anyfile-djvu-viewer button:focus-visible,
.anyfile-djvu-viewer input:focus-visible,
.anyfile-djvu-viewer__viewport:focus-visible {
  outline: 2px solid var(--viewer-accent, #2563eb);
  outline-offset: 1px;
}
.anyfile-djvu-viewer__page-input {
  width: 54px;
  padding: 0 6px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.anyfile-djvu-viewer__page-total,
.anyfile-djvu-viewer__zoom {
  font-size: 12px;
  color: var(--viewer-muted-foreground, #64748b);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.anyfile-djvu-viewer__zoom {
  min-width: 44px;
  text-align: center;
}
.anyfile-djvu-viewer__body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.anyfile-djvu-viewer__sidebar {
  display: flex;
  flex-direction: column;
  width: 240px;
  max-width: 75vw;
  flex: none;
  min-height: 0;
  border-right: 1px solid var(--viewer-border, #d1d5db);
  background: var(--viewer-background, #ffffff);
}
.anyfile-djvu-viewer__sidebar[hidden] {
  display: none;
}
.anyfile-djvu-viewer__tabs {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--viewer-border, #d1d5db);
}
.anyfile-djvu-viewer__tabs button {
  flex: 1;
}
.anyfile-djvu-viewer__panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.anyfile-djvu-viewer__panel[hidden] {
  display: none;
}
.anyfile-djvu-viewer__outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.anyfile-djvu-viewer__outline-list .anyfile-djvu-viewer__outline-list {
  padding-left: 12px;
}
.anyfile-djvu-viewer__outline-btn {
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
.anyfile-djvu-viewer__outline-btn:hover {
  background: var(--viewer-surface, #f1f5f9) !important;
}
.anyfile-djvu-viewer__thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
}
.anyfile-djvu-viewer__thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: auto !important;
  padding: 6px !important;
  border-radius: 8px;
}
.anyfile-djvu-viewer__thumb[data-active="true"] {
  border-color: var(--viewer-accent, #2563eb);
}
.anyfile-djvu-viewer__thumb canvas {
  display: block;
  max-width: 100%;
  background: #ffffff;
  border: 1px solid var(--viewer-border, #e5e7eb);
}
.anyfile-djvu-viewer__viewport {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.anyfile-djvu-viewer__pages {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: max-content;
  min-width: 100%;
  padding: 20px 16px;
}
.anyfile-djvu-viewer__page {
  position: relative;
  flex: none;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 2px 8px rgb(15 23 42 / 14%);
}
.anyfile-djvu-viewer__page canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.anyfile-djvu-viewer__text-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  user-select: text;
  pointer-events: auto;
}
.anyfile-djvu-viewer__text-layer[hidden] {
  display: none;
}
.anyfile-djvu-viewer__text-word {
  position: absolute;
  color: transparent;
  white-space: pre;
  line-height: 1;
  transform-origin: 0 0;
  cursor: text;
}
.anyfile-djvu-viewer__text-word::selection {
  background: rgb(37 99 235 / 26%);
  color: transparent;
}
.anyfile-djvu-viewer__page-badge {
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
.anyfile-djvu-viewer__footer {
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
.anyfile-djvu-viewer__source {
  color: var(--viewer-accent, #2563eb);
  text-decoration: none;
}
.anyfile-djvu-viewer__source:hover {
  text-decoration: underline;
}
.anyfile-djvu-viewer__error {
  margin: 16px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 13px;
}
@media (max-width: 720px) {
  .anyfile-djvu-viewer__sidebar {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 3;
    box-shadow: 4px 0 18px rgb(15 23 42 / 18%);
  }
  .anyfile-djvu-viewer__pages {
    padding: 12px 8px;
  }
}
`;
