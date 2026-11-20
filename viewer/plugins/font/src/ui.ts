import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { FontContainer, FontTable } from "./directory";
import type { FontMetadata } from "./metadata";

const WATERFALL = [12, 16, 20, 28, 40, 64, 96];
const GLYPHS = [
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789 !?@#$%&*()[]{}<>/\\|+-=",
  "字体预览：永東国語 한국어 かな カナ",
];
const SAMPLE = "Aa Bb Cc 0123 敏捷字体预览";
const MAX_SAMPLE = 120;

export interface FontViewOptions {
  readonly family: string;
  readonly container: FontContainer;
  readonly fileSize: number;
  readonly metadata: FontMetadata;
  readonly tables: readonly FontTable[];
  readonly locale: Locale;
}

export interface FontView {
  readonly root: HTMLElement;
  dispose(): void;
}

function copyFor(locale: Locale) {
  return selectMessages(locale, {
    en: {
      sample: "Sample text", preview: "Type specimen", glyphs: "Glyph samples", details: "Font details",
      format: "Container", size: "File size", family: "Family", subfamily: "Style", fullName: "Full name",
      version: "Version", unitsPerEm: "Units per em", glyphCount: "Glyphs", weight: "Weight", italic: "Italic",
      tables: "Table directory", tag: "Tag", stored: "Stored", original: "Uncompressed", unknown: "Unknown",
      woff2Note: "WOFF2 stores Brotli-compressed tables, so only the table directory is listed; the preview is rendered by the browser.",
      italicYes: "Yes", italicNo: "No",
    },
    "zh-CN": {
      sample: "示例文本", preview: "试打预览", glyphs: "字形样本", details: "字体信息",
      format: "容器格式", size: "文件大小", family: "字体家族", subfamily: "字重样式", fullName: "完整名称",
      version: "版本", unitsPerEm: "Em 单位", glyphCount: "字形数量", weight: "字重值", italic: "斜体",
      tables: "表目录", tag: "标签", stored: "占用字节", original: "解压后字节", unknown: "未知",
      woff2Note: "WOFF2 的表数据使用 Brotli 压缩，此处只列出表目录；预览由浏览器渲染。",
      italicYes: "是", italicNo: "否",
    },
  });
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function section(title: string, modifier: string) {
  const wrapper = node("section", `anyfile-font-viewer__section anyfile-font-viewer__section--${modifier}`);
  wrapper.append(node("h2", "anyfile-font-viewer__heading", title));
  return wrapper;
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function styles() {
  const style = node("style");
  style.textContent = `
    .anyfile-font-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
    .anyfile-font-viewer__toolbar { display:flex; flex:none; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid var(--viewer-border,#ddd); font-size:13px; }
    .anyfile-font-viewer__field { display:flex; align-items:center; gap:6px; }
    .anyfile-font-viewer__field input { box-sizing:border-box; width:min(340px,52vw); height:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 10px; font:inherit; }
    .anyfile-font-viewer__viewport { min-height:0; flex:1; overflow:auto; padding:16px 12px 28px; }
    .anyfile-font-viewer__section { max-width:1100px; margin:0 auto 26px; }
    .anyfile-font-viewer__heading { margin:0 0 10px; font-size:13px; font-weight:600; letter-spacing:.02em; color:#6b7280; text-transform:uppercase; }
    .anyfile-font-viewer__row { display:flex; align-items:baseline; gap:12px; border-bottom:1px dashed var(--viewer-border,#ddd); padding:6px 0; }
    .anyfile-font-viewer__size { flex:none; width:52px; font-size:11px; color:#6b7280; font-variant-numeric:tabular-nums; text-align:right; }
    .anyfile-font-viewer__line { flex:1; min-width:0; overflow-wrap:anywhere; line-height:1.25; white-space:pre-wrap; }
    .anyfile-font-viewer__section--glyphs .anyfile-font-viewer__line { font-size:28px; line-height:1.5; }
    .anyfile-font-viewer__details { display:grid; grid-template-columns:minmax(120px,180px) 1fr; gap:6px 16px; margin:0; font-size:13px; }
    .anyfile-font-viewer__details dt { color:#6b7280; }
    .anyfile-font-viewer__details dd { margin:0; overflow-wrap:anywhere; }
    .anyfile-font-viewer__note { margin:8px 0 0; font-size:12px; line-height:1.5; color:#6b7280; }
    .anyfile-font-viewer__tables { width:100%; border-collapse:collapse; font-size:12px; }
    .anyfile-font-viewer__tables th, .anyfile-font-viewer__tables td { border-bottom:1px solid var(--viewer-border,#ddd); padding:4px 8px; text-align:left; font-variant-numeric:tabular-nums; }
    .anyfile-font-viewer__tables th:first-child, .anyfile-font-viewer__tables td:first-child { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
    @media (prefers-color-scheme:dark) { .anyfile-font-viewer__heading, .anyfile-font-viewer__size, .anyfile-font-viewer__details dt, .anyfile-font-viewer__note { color:#9ca3af; } }
  `;
  return style;
}

export function createFontView(options: FontViewOptions): FontView {
  const { family, container, fileSize, metadata, tables, locale } = options;
  const copy = copyFor(locale);
  const stack = `"${family}", var(--viewer-font-family, sans-serif)`;

  const root = node("div", "anyfile-font-viewer");
  const toolbar = node("div", "anyfile-font-viewer__toolbar");
  const field = node("label", "anyfile-font-viewer__field");
  field.append(node("span", undefined, copy.sample));
  const input = node("input");
  input.type = "text";
  input.value = SAMPLE;
  input.maxLength = MAX_SAMPLE;
  input.setAttribute("aria-label", copy.sample);
  field.append(input);
  toolbar.append(field);

  const viewport = node("div", "anyfile-font-viewer__viewport");
  const lines: HTMLElement[] = [];
  const addLines = (target: HTMLElement, text: string, sizes: readonly number[], editable = false) => {
    for (const size of sizes) {
      const row = node("div", "anyfile-font-viewer__row");
      const line = node("span", "anyfile-font-viewer__line", text);
      line.style.fontFamily = stack;
      if (size) row.append(node("span", "anyfile-font-viewer__size", `${size}`));
      if (size) line.style.fontSize = `${size}px`;
      row.append(line);
      target.append(row);
      if (editable) lines.push(line);
    }
  };

  const preview = section(copy.preview, "preview");
  addLines(preview, SAMPLE, WATERFALL, true);
  const glyphs = section(copy.glyphs, "glyphs");
  for (const row of GLYPHS) addLines(glyphs, row, [0]);

  const details = section(copy.details, "details");
  const list = node("dl", "anyfile-font-viewer__details");
  const addDetail = (label: string, value: string | undefined) => {
    if (!value) return;
    list.append(node("dt", undefined, label), node("dd", undefined, value));
  };
  addDetail(copy.family, metadata.family);
  addDetail(copy.subfamily, metadata.subfamily);
  addDetail(copy.fullName, metadata.fullName);
  addDetail(copy.version, metadata.version);
  addDetail(copy.format, container.toUpperCase());
  addDetail(copy.size, bytes(fileSize));
  addDetail(copy.unitsPerEm, metadata.unitsPerEm?.toString());
  addDetail(copy.glyphCount, metadata.glyphs?.toString());
  addDetail(copy.weight, metadata.weight?.toString());
  addDetail(copy.italic, metadata.italic === undefined ? undefined : metadata.italic ? copy.italicYes : copy.italicNo);
  details.append(list);
  if (!metadata.family) details.append(node("p", "anyfile-font-viewer__note", copy.woff2Note));

  const directory = section(copy.tables, "tables");
  const table = node("table", "anyfile-font-viewer__tables");
  const head = node("thead"), headRow = node("tr");
  headRow.append(node("th", undefined, copy.tag), node("th", undefined, copy.stored), node("th", undefined, copy.original));
  head.append(headRow);
  const body = node("tbody");
  for (const item of tables) {
    const row = node("tr");
    row.append(node("td", undefined, item.tag), node("td", undefined, bytes(item.length)), node("td", undefined, bytes(item.origLength)));
    body.append(row);
  }
  table.append(head, body);
  directory.append(table);

  viewport.append(preview, glyphs, details, directory);
  root.append(styles(), toolbar, viewport);

  const onInput = () => { for (const line of lines) line.textContent = input.value.slice(0, MAX_SAMPLE) || " "; };
  input.addEventListener("input", onInput);

  return {
    root,
    dispose() {
      input.removeEventListener("input", onInput);
      root.remove();
    },
  };
}
