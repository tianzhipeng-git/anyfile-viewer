import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { ModelDocument } from "./types";

function copyFor(locale: Locale) {
  return selectMessages(locale, { "zh-CN": {
    overview: "概览", metadata: "元数据", tensors: "张量", format: "格式", architecture: "架构",
    tensorCount: "张量数", parameters: "参数量", weightSize: "权重体积", name: "名称", key: "键", value: "值",
    tensorName: "张量", dtype: "类型", shape: "形状", size: "大小", filter: "筛选张量名称",
    empty: "没有匹配的张量", hidden: "张量过多，仅显示前 5000 个。", noData: "无", sortAsc: "按元素数升序",
    sortDesc: "按元素数降序", metaEmpty: "文件没有额外的元数据。",
  }, en: {
    overview: "Overview", metadata: "Metadata", tensors: "Tensors", format: "Format", architecture: "Architecture",
    tensorCount: "Tensors", parameters: "Parameters", weightSize: "Weight size", name: "Name", key: "Key", value: "Value",
    tensorName: "Tensor", dtype: "Type", shape: "Shape", size: "Size", filter: "Filter tensor names",
    empty: "No matching tensors", hidden: "Too many tensors; only the first 5000 are shown.", noData: "None", sortAsc: "Sort by element count ascending",
    sortDesc: "Sort by element count descending", metaEmpty: "This file has no extra metadata.",
  } });
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatBytes(value: number, locale: string) {
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"];
  let size = value;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toLocaleString(locale, { maximumFractionDigits: 2 })} ${units[unit]}`;
}

function formatCount(value: number, locale: string) {
  if (value >= 1e12) return `${(value / 1e12).toLocaleString(locale, { maximumFractionDigits: 2 })}T`;
  if (value >= 1e9) return `${(value / 1e9).toLocaleString(locale, { maximumFractionDigits: 2 })}B`;
  if (value >= 1e6) return `${(value / 1e6).toLocaleString(locale, { maximumFractionDigits: 2 })}M`;
  if (value >= 1e3) return `${(value / 1e3).toLocaleString(locale, { maximumFractionDigits: 2 })}K`;
  return value.toLocaleString(locale);
}

const MAX_ROWS = 5000;

export function createModelView(document: ModelDocument, locale: Locale) {
  const copy = copyFor(locale);
  const root = node("div", "anyfile-ml-weights-viewer");
  const toolbar = node("div", "anyfile-ml-weights-viewer__toolbar");
  const title = node("div", "anyfile-ml-weights-viewer__title", document.name);
  title.title = document.name;
  const stats = [
    document.version ?? document.format,
    `${document.tensorCount.toLocaleString(locale)} ${copy.tensorCount}`,
    `${copy.parameters}: ${formatCount(document.totalParameters, locale)}`,
    `${copy.weightSize}: ${formatBytes(document.totalBytes, locale)}`,
  ].map((text) => node("span", "anyfile-ml-weights-viewer__stat", text));
  const filter = node("input", "anyfile-ml-weights-viewer__filter") as HTMLInputElement;
  filter.type = "search";
  filter.placeholder = copy.filter;
  filter.setAttribute("aria-label", copy.filter);
  filter.dataset.mlWeightsFilter = "";
  toolbar.append(title, ...stats, filter);

  const body = node("div", "anyfile-ml-weights-viewer__body");

  // Metadata panel.
  const metadata = node("section", "anyfile-ml-weights-viewer__metadata");
  const overviewRows: [string, string][] = [
    [copy.format, document.version ?? document.format],
    [copy.tensorCount, document.tensorCount.toLocaleString(locale)],
    [copy.parameters, formatCount(document.totalParameters, locale)],
    [copy.weightSize, formatBytes(document.totalBytes, locale)],
  ];
  if (document.architecture) overviewRows.push([copy.architecture, document.architecture]);
  const overview = node("dl", "anyfile-ml-weights-viewer__overview");
  for (const [label, value] of overviewRows) overview.append(node("dt", undefined, label), node("dd", undefined, value));
  metadata.append(overview);

  metadata.append(node("h3", undefined, copy.metadata));
  if (document.metadata.length === 0) {
    metadata.append(node("p", "anyfile-ml-weights-viewer__muted", copy.metaEmpty));
  } else {
    const table = node("table", "anyfile-ml-weights-viewer__meta-table");
    const tbody = node("tbody");
    for (const entry of document.metadata) {
      const row = node("tr");
      row.append(node("td", "anyfile-ml-weights-viewer__meta-key", entry.key), node("td", "anyfile-ml-weights-viewer__meta-value", entry.value));
      tbody.append(row);
    }
    table.append(tbody);
    metadata.append(table);
  }

  // Tensor table.
  const tensors = node("section", "anyfile-ml-weights-viewer__tensors");
  tensors.append(node("h3", undefined, copy.tensors));
  const table = node("table", "anyfile-ml-weights-viewer__table");
  const header = node("tr");
  const nameHead = node("th", undefined, copy.tensorName);
  const dtypeHead = node("th", "anyfile-ml-weights-viewer__dtype-head", copy.dtype);
  const shapeHead = node("th", undefined, copy.shape);
  const sizeHead = node("th", "anyfile-ml-weights-viewer__size-head", copy.size) as HTMLTableCellElement;
  sizeHead.dataset.sort = "none";
  header.append(nameHead, dtypeHead, shapeHead, sizeHead);
  const thead = node("thead");
  thead.append(header);
  const tbody = node("tbody");
  table.append(thead, tbody);
  tensors.append(table);

  body.append(metadata, tensors);
  root.append(styles(), toolbar, body);

  const elementsOf = (shape: readonly number[]) => shape.reduce((product, dimension) => product * dimension, 1);
  let sort: "none" | "asc" | "desc" = "none";
  const render = () => {
    const query = filter.value.trim().toLowerCase();
    let visible = query ? document.tensors.filter((tensor) => tensor.name.toLowerCase().includes(query)) : document.tensors;
    if (sort !== "none") {
      visible = [...visible].sort((a, b) => sort === "asc" ? elementsOf(a.shape) - elementsOf(b.shape) : elementsOf(b.shape) - elementsOf(a.shape));
    }
    const capped = visible.slice(0, MAX_ROWS);
    tbody.replaceChildren(...capped.map((tensor) => {
      const row = node("tr");
      row.append(
        node("td", "anyfile-ml-weights-viewer__tensor-name", tensor.name),
        node("td", "anyfile-ml-weights-viewer__dtype", tensor.dtype),
        node("td", "anyfile-ml-weights-viewer__shape", `[${tensor.shape.join(" × ")}]`),
        node("td", "anyfile-ml-weights-viewer__size", formatBytes(tensor.bytes, locale)),
      );
      return row;
    }));
    if (visible.length === 0) {
      const row = node("tr");
      const cell = node("td", "anyfile-ml-weights-viewer__empty", copy.empty);
      cell.colSpan = 4;
      row.append(cell);
      tbody.append(row);
    } else if (visible.length > MAX_ROWS) {
      const row = node("tr");
      const cell = node("td", "anyfile-ml-weights-viewer__note", copy.hidden);
      cell.colSpan = 4;
      row.append(cell);
      tbody.append(row);
    }
  };

  filter.addEventListener("input", render);
  sizeHead.addEventListener("click", () => {
    sort = sort === "none" ? "desc" : sort === "desc" ? "asc" : "none";
    sizeHead.dataset.sort = sort;
    sizeHead.title = sort === "asc" ? copy.sortAsc : copy.sortDesc;
    render();
  });

  render();
  return {
    root,
    dispose() {
      filter.removeEventListener("input", render);
      root.remove();
    },
  };
}

function styles() {
  const style = node("style");
  style.textContent = `
    .anyfile-ml-weights-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font:13px/1.45 var(--viewer-font-family,system-ui); }
    .anyfile-ml-weights-viewer__toolbar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; padding:12px 16px; border-bottom:1px solid var(--viewer-border,#ddd); }
    .anyfile-ml-weights-viewer__title { min-width:160px; max-width:360px; overflow:hidden; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-ml-weights-viewer__stat { color:color-mix(in srgb,var(--viewer-foreground,#111) 62%,transparent); white-space:nowrap; }
    .anyfile-ml-weights-viewer__filter { box-sizing:border-box; min-width:200px; flex:1; padding:7px 10px; border:1px solid var(--viewer-border,#ddd); border-radius:6px; background:var(--viewer-background,#fff); color:inherit; }
    .anyfile-ml-weights-viewer__body { min-height:0; flex:1; display:grid; grid-template-columns:minmax(280px,0.8fr) minmax(360px,1.2fr); overflow:hidden; }
    .anyfile-ml-weights-viewer__metadata { min-height:0; padding:14px 18px; overflow:auto; border-inline-end:1px solid var(--viewer-border,#ddd); }
    .anyfile-ml-weights-viewer__overview { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:6px 14px; margin:0 0 16px; }
    .anyfile-ml-weights-viewer__overview dt { color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); }
    .anyfile-ml-weights-viewer__overview dd { min-width:0; margin:0; overflow-wrap:anywhere; }
    .anyfile-ml-weights-viewer__metadata h3, .anyfile-ml-weights-viewer__tensors h3 { margin:0 0 8px; font-size:13px; }
    .anyfile-ml-weights-viewer__meta-table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .anyfile-ml-weights-viewer__meta-table td { padding:5px 0; border-bottom:1px solid color-mix(in srgb,var(--viewer-border,#ddd) 60%,transparent); vertical-align:top; overflow-wrap:anywhere; }
    .anyfile-ml-weights-viewer__meta-key { width:42%; padding-inline-end:12px; color:color-mix(in srgb,var(--viewer-foreground,#111) 60%,transparent); }
    .anyfile-ml-weights-viewer__meta-value { font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .anyfile-ml-weights-viewer__tensors { min-height:0; overflow:auto; padding:14px 0 0; }
    .anyfile-ml-weights-viewer__tensors h3 { padding:0 18px; }
    .anyfile-ml-weights-viewer__table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .anyfile-ml-weights-viewer__table th { position:sticky; top:0; z-index:1; padding:8px 12px; border-bottom:1px solid var(--viewer-border,#ddd); background:color-mix(in srgb,var(--viewer-background,#fff) 94%,var(--viewer-foreground,#111)); text-align:start; }
    .anyfile-ml-weights-viewer__table td { padding:7px 12px; border-bottom:1px solid color-mix(in srgb,var(--viewer-border,#ddd) 72%,transparent); vertical-align:top; }
    .anyfile-ml-weights-viewer__dtype-head { width:88px; } .anyfile-ml-weights-viewer__size-head { width:104px; cursor:pointer; user-select:none; }
    .anyfile-ml-weights-viewer__size-head[data-sort='asc']::after { content:" ▲"; } .anyfile-ml-weights-viewer__size-head[data-sort='desc']::after { content:" ▼"; }
    .anyfile-ml-weights-viewer__tensor-name, .anyfile-ml-weights-viewer__shape { overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
    .anyfile-ml-weights-viewer__shape, .anyfile-ml-weights-viewer__dtype { font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .anyfile-ml-weights-viewer__size { font-variant-numeric:tabular-nums; white-space:nowrap; text-align:end; }
    .anyfile-ml-weights-viewer__muted, .anyfile-ml-weights-viewer__note, .anyfile-ml-weights-viewer__empty { color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); }
    .anyfile-ml-weights-viewer__note { padding:10px 12px; font-size:12px; } .anyfile-ml-weights-viewer__empty { padding:36px 12px; text-align:center; }
  `;
  return style;
}
