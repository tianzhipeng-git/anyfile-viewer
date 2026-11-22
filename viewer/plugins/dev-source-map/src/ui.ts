import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createInspectorShell,
  createKeyValueList,
  createNotice,
  createSection,
  el,
  viewerTheme,
} from "@anyfile/viewer-ui";

import { displaySourcePath, findOriginalPosition, type SourceMapDocument } from "./parser";

const MAX_TABLE_ROWS = 500;
const MAX_PREVIEW_CHARACTERS = 200_000;

const extraStyles = `
  .anyfile-source-map-viewer__query { display:flex; flex-wrap:wrap; align-items:end; gap:8px; padding:10px; border:1px solid ${viewerTheme.border}; border-radius:8px; }
  .anyfile-source-map-viewer__query label { display:grid; gap:3px; color:${viewerTheme.muted}; font-size:11px; }
  .anyfile-source-map-viewer__query input { height:30px; border:1px solid ${viewerTheme.border}; border-radius:6px; background:${viewerTheme.background}; color:inherit; padding:0 9px; font:inherit; }
  .anyfile-source-map-viewer__result { min-width:220px; margin:0; overflow-wrap:anywhere; font-size:12px; }
  .anyfile-source-map-viewer__embedded-select { margin-bottom:8px; max-width:100%; }
`;

export function createSourceMapView(fileName: string, document: SourceMapDocument, locale: Locale) {
  const copy = selectMessages(locale, {
    en: { description: "ECMA-426 mapping preview · external sources are not requested", target: "Target file", lines: "Generated lines", segments: "Mapping segments", mapped: "Mapped segments", warning: "An external source-map section was not loaded.", lookup: "Generated → Original lookup", line: "Generated line (starts at 1)", column: "Generated column (starts at 0)", submit: "Look up", prompt: "Enter a generated position to find its original location.", invalid: "Enter a valid non-negative position.", missing: "No original mapping is available for this generated position.", index: "Index", path: "Path", embedded: "Embedded source", ignored: "Ignored", no: "No", yes: "Yes", sourceLimit: `Only the first ${MAX_TABLE_ROWS} sources are listed; all sources remain available for position lookup.`, embeddedSources: "Embedded sources", chooseSource: "Choose embedded source", truncated: "… (preview truncated)", samples: "Mapping samples", generatedPosition: "Generated position", originalPosition: "Original position", name: "Name" },
    "zh-CN": { description: "ECMA-426 映射预览 · 不请求外部 sources", target: "目标文件", lines: "生成行", segments: "映射段", mapped: "有效映射", warning: "未加载外部 section。", lookup: "Generated → Original 查询", line: "生成行（从 1 开始）", column: "生成列（从 0 开始）", submit: "查询", prompt: "输入生成位置以查询原始位置。", invalid: "请输入有效的非负位置。", missing: "该生成位置没有可用的原始映射。", index: "索引", path: "路径", embedded: "内嵌源码", ignored: "忽略", no: "否", yes: "是", sourceLimit: `仅列出前 ${MAX_TABLE_ROWS} 个 source；全部 source 仍可用于位置查询。`, embeddedSources: "内嵌源码", chooseSource: "选择内嵌源码", truncated: "…（预览已截断）", samples: "映射样本", generatedPosition: "生成位置", originalPosition: "原始位置", name: "名称" },
  });

  const shell = createInspectorShell({
    className: "anyfile-source-map-viewer",
    title: fileName,
    subtitle: copy.description,
    viewportClassName: "anyfile-source-map-viewer__viewport",
    extraStyles,
  });

  const mapped = document.mappings.filter((mapping) => mapping.sourceIndex !== undefined).length;
  shell.viewport.append(createKeyValueList([
    { label: copy.target, value: document.file ?? "—" },
    { label: copy.lines, value: String(document.generatedLines) },
    { label: copy.segments, value: String(document.mappings.length) },
    { label: copy.mapped, value: String(mapped) },
    { label: "Sources", value: String(document.sources.length) },
    { label: "Names", value: String(document.names.length) },
    { label: "Indexed sections", value: String(document.sections) },
  ], { variant: "cards" }));

  for (let index = 0; index < document.warnings.length; index += 1) {
    shell.viewport.append(createNotice(copy.warning, "warning"));
  }

  const lineInput = el("input", { attrs: { type: "number", min: "1", value: "1" } });
  const columnInput = el("input", { attrs: { type: "number", min: "0", value: "0" } });
  const submit = el("button", { className: "anyfile-inspector__btn", attrs: { type: "submit" } }, copy.submit);
  const result = el("p", { className: "anyfile-source-map-viewer__result", role: "status" }, copy.prompt);
  const query = el(
    "form",
    "anyfile-source-map-viewer__query",
    el("label", undefined, copy.line, lineInput),
    el("label", undefined, copy.column, columnInput),
    submit,
    result,
  );
  const onSubmit = (event: Event) => {
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
  };
  query.addEventListener("submit", onSubmit);
  shell.onDispose(() => query.removeEventListener("submit", onSubmit));
  shell.viewport.append(createSection(copy.lookup, query));

  const sourcesTable = createDataTable({
    columns: [{ label: copy.index, width: "64px" }, { label: copy.path }, { label: copy.embedded }, { label: copy.ignored }],
    rows: document.sources.slice(0, MAX_TABLE_ROWS).map((source, index) => [
      String(index), displaySourcePath(source.path), source.content === null ? copy.no : copy.yes, source.ignored ? copy.yes : copy.no,
    ]),
    note: document.sources.length > MAX_TABLE_ROWS ? copy.sourceLimit : undefined,
    stickyHeader: false,
    bordered: true,
  });
  shell.viewport.append(createSection("Sources", sourcesTable.element));

  const embedded = document.sources.map((source, index) => ({ source, index })).filter(({ source }) => source.content !== null);
  if (embedded.length > 0) {
    const select = el("select", {
      className: "anyfile-inspector__select anyfile-source-map-viewer__embedded-select",
      attrs: { "aria-label": copy.chooseSource },
    });
    for (const { source, index } of embedded) {
      const option = el("option", undefined, displaySourcePath(source.path));
      option.value = String(index);
      select.append(option);
    }
    const preview = el("pre", "anyfile-inspector__code");
    const renderPreview = () => {
      const content = document.sources[Number(select.value)].content ?? "";
      preview.textContent = content.length > MAX_PREVIEW_CHARACTERS
        ? `${content.slice(0, MAX_PREVIEW_CHARACTERS)}\n${copy.truncated}`
        : content;
    };
    select.addEventListener("change", renderPreview);
    shell.onDispose(() => select.removeEventListener("change", renderPreview));
    select.value = String(embedded[0].index);
    renderPreview();
    shell.viewport.append(createSection(copy.embeddedSources, [select, preview]));
  }

  const samplesTable = createDataTable({
    columns: [
      { label: copy.generatedPosition, mono: true },
      { label: copy.originalPosition, mono: true },
      { label: copy.name, mono: true },
    ],
    rows: document.mappings.slice(0, 200).map((mapping) => {
      const original = mapping.sourceIndex === undefined || mapping.originalLine === undefined || mapping.originalColumn === undefined
        ? "—"
        : `${displaySourcePath(document.sources[mapping.sourceIndex].path)}:${mapping.originalLine + 1}:${mapping.originalColumn}`;
      return [
        `${mapping.generatedLine + 1}:${mapping.generatedColumn}`,
        original,
        mapping.nameIndex === undefined ? "—" : document.names[mapping.nameIndex],
      ];
    }),
    stickyHeader: false,
    bordered: true,
  });
  shell.viewport.append(createSection(copy.samples, samplesTable.element));

  return { root: shell.root, dispose: () => shell.dispose() };
}
