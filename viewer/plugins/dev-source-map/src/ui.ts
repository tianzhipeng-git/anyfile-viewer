import { displaySourcePath, findOriginalPosition, type SourceMapDocument } from "./parser";
import { sourceMapStyles } from "./styles";

const MAX_TABLE_ROWS = 500;
const MAX_PREVIEW_CHARACTERS = 200_000;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]) {
  const node = element("table");
  const head = element("thead");
  const headerRow = element("tr");
  for (const header of headers) headerRow.append(element("th", header));
  head.append(headerRow);
  const body = element("tbody");
  for (const values of rows) {
    const row = element("tr");
    for (const value of values) row.append(element("td", value));
    body.append(row);
  }
  node.append(head, body);
  return node;
}

export function createSourceMapView(fileName: string, document: SourceMapDocument) {
  const root = element("div");
  root.className = "anyfile-source-map-viewer";
  const style = element("style");
  style.textContent = sourceMapStyles;
  const header = element("header");
  header.className = "anyfile-source-map-viewer__header";
  const title = element("strong", fileName);
  title.title = fileName;
  header.append(title, element("span", "ECMA-426 映射预览 · 不请求外部 sources"));
  const viewport = element("div");
  viewport.className = "anyfile-source-map-viewer__viewport";
  const summary = element("dl");
  summary.className = "anyfile-source-map-viewer__summary";
  const mapped = document.mappings.filter((mapping) => mapping.sourceIndex !== undefined).length;
  for (const [term, value] of [
    ["目标文件", document.file ?? "—"], ["生成行", String(document.generatedLines)],
    ["映射段", String(document.mappings.length)], ["有效映射", String(mapped)],
    ["Sources", String(document.sources.length)], ["Names", String(document.names.length)],
    ["Indexed sections", String(document.sections)],
  ]) {
    const item = element("div");
    item.append(element("dt", term), element("dd", value));
    summary.append(item);
  }
  viewport.append(summary);
  for (const warning of document.warnings) {
    const node = element("p", warning);
    node.className = "anyfile-source-map-viewer__warning";
    viewport.append(node);
  }

  viewport.append(element("h2", "Generated → Original 查询"));
  const query = element("form");
  query.className = "anyfile-source-map-viewer__query";
  const lineLabel = element("label", "生成行（从 1 开始）");
  const lineInput = element("input");
  lineInput.type = "number";
  lineInput.min = "1";
  lineInput.value = "1";
  lineLabel.append(lineInput);
  const columnLabel = element("label", "生成列（从 0 开始）");
  const columnInput = element("input");
  columnInput.type = "number";
  columnInput.min = "0";
  columnInput.value = "0";
  columnLabel.append(columnInput);
  const submit = element("button", "查询");
  submit.type = "submit";
  const result = element("p", "输入生成位置以查询原始位置。");
  result.className = "anyfile-source-map-viewer__result";
  result.setAttribute("role", "status");
  query.append(lineLabel, columnLabel, submit, result);
  query.addEventListener("submit", (event) => {
    event.preventDefault();
    const line = Number(lineInput.value) - 1;
    const column = Number(columnInput.value);
    if (!Number.isSafeInteger(line) || line < 0 || !Number.isSafeInteger(column) || column < 0) {
      result.textContent = "请输入有效的非负位置。";
      return;
    }
    const mapping = findOriginalPosition(document, line, column);
    if (!mapping || mapping.sourceIndex === undefined || mapping.originalLine === undefined || mapping.originalColumn === undefined) {
      result.textContent = "该生成位置没有可用的原始映射。";
      return;
    }
    const name = mapping.nameIndex === undefined ? "" : ` · ${document.names[mapping.nameIndex]}`;
    result.textContent = `${displaySourcePath(document.sources[mapping.sourceIndex].path)}:${mapping.originalLine + 1}:${mapping.originalColumn}${name}`;
  });
  viewport.append(query);

  viewport.append(element("h2", "Sources"));
  viewport.append(table(["索引", "路径", "内嵌源码", "忽略"], document.sources.slice(0, MAX_TABLE_ROWS).map((source, index) => [
    String(index), displaySourcePath(source.path), source.content === null ? "否" : "是", source.ignored ? "是" : "否",
  ])));
  if (document.sources.length > MAX_TABLE_ROWS) {
    const note = element("p", `仅列出前 ${MAX_TABLE_ROWS} 个 source；全部 source 仍可用于位置查询。`);
    note.className = "anyfile-source-map-viewer__muted";
    viewport.append(note);
  }

  const embedded = document.sources.map((source, index) => ({ source, index })).filter(({ source }) => source.content !== null);
  if (embedded.length > 0) {
    viewport.append(element("h2", "内嵌源码"));
    const select = element("select");
    select.setAttribute("aria-label", "选择内嵌源码");
    for (const { source, index } of embedded) {
      const option = element("option", displaySourcePath(source.path));
      option.value = String(index);
      select.append(option);
    }
    const preview = element("pre");
    preview.className = "anyfile-source-map-viewer__preview";
    const renderPreview = () => {
      const content = document.sources[Number(select.value)].content ?? "";
      preview.textContent = content.length > MAX_PREVIEW_CHARACTERS
        ? `${content.slice(0, MAX_PREVIEW_CHARACTERS)}\n…（预览已截断）`
        : content;
    };
    select.addEventListener("change", renderPreview);
    select.value = String(embedded[0].index);
    renderPreview();
    viewport.append(select, preview);
  }

  viewport.append(element("h2", "映射样本"));
  viewport.append(table(["生成位置", "原始位置", "名称"], document.mappings.slice(0, 200).map((mapping) => {
    const original = mapping.sourceIndex === undefined || mapping.originalLine === undefined || mapping.originalColumn === undefined
      ? "—"
      : `${displaySourcePath(document.sources[mapping.sourceIndex].path)}:${mapping.originalLine + 1}:${mapping.originalColumn}`;
    return [`${mapping.generatedLine + 1}:${mapping.generatedColumn}`, original,
      mapping.nameIndex === undefined ? "—" : document.names[mapping.nameIndex]];
  })));
  root.append(style, header, viewport);
  return root;
}
