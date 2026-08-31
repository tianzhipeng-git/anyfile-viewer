import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

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

export function createSourceMapView(fileName: string, document: SourceMapDocument, locale: Locale) {
  const copy = selectMessages(locale, {
    en: { description: "ECMA-426 mapping preview · external sources are not requested", target: "Target file", lines: "Generated lines", segments: "Mapping segments", mapped: "Mapped segments", warning: "An external source-map section was not loaded.", lookup: "Generated → Original lookup", line: "Generated line (starts at 1)", column: "Generated column (starts at 0)", submit: "Look up", prompt: "Enter a generated position to find its original location.", invalid: "Enter a valid non-negative position.", missing: "No original mapping is available for this generated position.", index: "Index", path: "Path", embedded: "Embedded source", ignored: "Ignored", no: "No", yes: "Yes", sourceLimit: `Only the first ${MAX_TABLE_ROWS} sources are listed; all sources remain available for position lookup.`, embeddedSources: "Embedded sources", chooseSource: "Choose embedded source", truncated: "… (preview truncated)", samples: "Mapping samples", generatedPosition: "Generated position", originalPosition: "Original position", name: "Name" },
    "zh-CN": { description: "ECMA-426 映射预览 · 不请求外部 sources", target: "目标文件", lines: "生成行", segments: "映射段", mapped: "有效映射", warning: "未加载外部 section。", lookup: "Generated → Original 查询", line: "生成行（从 1 开始）", column: "生成列（从 0 开始）", submit: "查询", prompt: "输入生成位置以查询原始位置。", invalid: "请输入有效的非负位置。", missing: "该生成位置没有可用的原始映射。", index: "索引", path: "路径", embedded: "内嵌源码", ignored: "忽略", no: "否", yes: "是", sourceLimit: `仅列出前 ${MAX_TABLE_ROWS} 个 source；全部 source 仍可用于位置查询。`, embeddedSources: "内嵌源码", chooseSource: "选择内嵌源码", truncated: "…（预览已截断）", samples: "映射样本", generatedPosition: "生成位置", originalPosition: "原始位置", name: "名称" },
  });
  const root = element("div");
  root.className = "anyfile-source-map-viewer";
  const style = element("style");
  style.textContent = sourceMapStyles;
  const header = element("header");
  header.className = "anyfile-source-map-viewer__header";
  const title = element("strong", fileName);
  title.title = fileName;
  header.append(title, element("span", copy.description));
  const viewport = element("div");
  viewport.className = "anyfile-source-map-viewer__viewport";
  const summary = element("dl");
  summary.className = "anyfile-source-map-viewer__summary";
  const mapped = document.mappings.filter((mapping) => mapping.sourceIndex !== undefined).length;
  for (const [term, value] of [
    [copy.target, document.file ?? "—"], [copy.lines, String(document.generatedLines)],
    [copy.segments, String(document.mappings.length)], [copy.mapped, String(mapped)],
    ["Sources", String(document.sources.length)], ["Names", String(document.names.length)],
    ["Indexed sections", String(document.sections)],
  ]) {
    const item = element("div");
    item.append(element("dt", term), element("dd", value));
    summary.append(item);
  }
  viewport.append(summary);
  for (let index = 0; index < document.warnings.length; index += 1) {
    const node = element("p", copy.warning);
    node.className = "anyfile-source-map-viewer__warning";
    viewport.append(node);
  }

  viewport.append(element("h2", copy.lookup));
  const query = element("form");
  query.className = "anyfile-source-map-viewer__query";
  const lineLabel = element("label", copy.line);
  const lineInput = element("input");
  lineInput.type = "number";
  lineInput.min = "1";
  lineInput.value = "1";
  lineLabel.append(lineInput);
  const columnLabel = element("label", copy.column);
  const columnInput = element("input");
  columnInput.type = "number";
  columnInput.min = "0";
  columnInput.value = "0";
  columnLabel.append(columnInput);
  const submit = element("button", copy.submit);
  submit.type = "submit";
  const result = element("p", copy.prompt);
  result.className = "anyfile-source-map-viewer__result";
  result.setAttribute("role", "status");
  query.append(lineLabel, columnLabel, submit, result);
  query.addEventListener("submit", (event) => {
    event.preventDefault();
    const line = Number(lineInput.value) - 1;
    const column = Number(columnInput.value);
    if (!Number.isSafeInteger(line) || line < 0 || !Number.isSafeInteger(column) || column < 0) {
      result.textContent = copy.invalid;
      return;
    }
    const mapping = findOriginalPosition(document, line, column);
    if (!mapping || mapping.sourceIndex === undefined || mapping.originalLine === undefined || mapping.originalColumn === undefined) {
      result.textContent = copy.missing;
      return;
    }
    const name = mapping.nameIndex === undefined ? "" : ` · ${document.names[mapping.nameIndex]}`;
    result.textContent = `${displaySourcePath(document.sources[mapping.sourceIndex].path)}:${mapping.originalLine + 1}:${mapping.originalColumn}${name}`;
  });
  viewport.append(query);

  viewport.append(element("h2", "Sources"));
  viewport.append(table([copy.index, copy.path, copy.embedded, copy.ignored], document.sources.slice(0, MAX_TABLE_ROWS).map((source, index) => [
    String(index), displaySourcePath(source.path), source.content === null ? copy.no : copy.yes, source.ignored ? copy.yes : copy.no,
  ])));
  if (document.sources.length > MAX_TABLE_ROWS) {
    const note = element("p", copy.sourceLimit);
    note.className = "anyfile-source-map-viewer__muted";
    viewport.append(note);
  }

  const embedded = document.sources.map((source, index) => ({ source, index })).filter(({ source }) => source.content !== null);
  if (embedded.length > 0) {
    viewport.append(element("h2", copy.embeddedSources));
    const select = element("select");
    select.setAttribute("aria-label", copy.chooseSource);
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
        ? `${content.slice(0, MAX_PREVIEW_CHARACTERS)}\n${copy.truncated}`
        : content;
    };
    select.addEventListener("change", renderPreview);
    select.value = String(embedded[0].index);
    renderPreview();
    viewport.append(select, preview);
  }

  viewport.append(element("h2", copy.samples));
  viewport.append(table([copy.generatedPosition, copy.originalPosition, copy.name], document.mappings.slice(0, 200).map((mapping) => {
    const original = mapping.sourceIndex === undefined || mapping.originalLine === undefined || mapping.originalColumn === undefined
      ? "—"
      : `${displaySourcePath(document.sources[mapping.sourceIndex].path)}:${mapping.originalLine + 1}:${mapping.originalColumn}`;
    return [`${mapping.generatedLine + 1}:${mapping.generatedColumn}`, original,
      mapping.nameIndex === undefined ? "—" : document.names[mapping.nameIndex]];
  })));
  root.append(style, header, viewport);
  return root;
}
