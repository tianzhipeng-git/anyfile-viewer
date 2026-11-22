import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createSection,
  el,
  formatBytes,
  type KeyValueItem,
  type SortDirection,
} from "@anyfile/viewer-ui";

import type { ModelDocument } from "./types";

function copyFor(locale: Locale) {
  return selectMessages(locale, { "zh-CN": {
    overview: "概览", metadata: "元数据", tensors: "张量", format: "格式", architecture: "架构",
    tensorCount: "张量数", parameters: "参数量", weightSize: "权重体积", key: "键", value: "值",
    tensorName: "张量", dtype: "类型", shape: "形状", size: "大小", filter: "筛选张量名称",
    empty: "没有匹配的张量", hidden: "张量过多，仅显示前 5000 个。", sortAsc: "按元素数升序",
    sortDesc: "按元素数降序", metaEmpty: "文件没有额外的元数据。",
  }, en: {
    overview: "Overview", metadata: "Metadata", tensors: "Tensors", format: "Format", architecture: "Architecture",
    tensorCount: "Tensors", parameters: "Parameters", weightSize: "Weight size", key: "Key", value: "Value",
    tensorName: "Tensor", dtype: "Type", shape: "Shape", size: "Size", filter: "Filter tensor names",
    empty: "No matching tensors", hidden: "Too many tensors; only the first 5000 are shown.", sortAsc: "Sort by element count ascending",
    sortDesc: "Sort by element count descending", metaEmpty: "This file has no extra metadata.",
  } });
}

function formatCount(value: number, locale: string) {
  if (value >= 1e12) return `${(value / 1e12).toLocaleString(locale, { maximumFractionDigits: 2 })}T`;
  if (value >= 1e9) return `${(value / 1e9).toLocaleString(locale, { maximumFractionDigits: 2 })}B`;
  if (value >= 1e6) return `${(value / 1e6).toLocaleString(locale, { maximumFractionDigits: 2 })}M`;
  if (value >= 1e3) return `${(value / 1e3).toLocaleString(locale, { maximumFractionDigits: 2 })}K`;
  return value.toLocaleString(locale);
}

const MAX_ROWS = 5000;

const extraStyles = `
  .anyfile-ml-weights-viewer__tensors { padding:14px 0 0; }
  .anyfile-ml-weights-viewer__tensors > .anyfile-inspector__heading { padding-inline:16px; }
`;

export function createModelView(document: ModelDocument, locale: Locale) {
  const copy = copyFor(locale);
  const shell = createInspectorShell({
    className: "anyfile-ml-weights-viewer",
    title: document.name,
    stats: [
      document.version ?? document.format,
      `${document.tensorCount.toLocaleString(locale)} ${copy.tensorCount}`,
      `${copy.parameters}: ${formatCount(document.totalParameters, locale)}`,
      `${copy.weightSize}: ${formatBytes(document.totalBytes, locale)}`,
    ],
    layout: "split",
    extraStyles,
  });

  const overviewItems: KeyValueItem[] = [
    { label: copy.format, value: document.version ?? document.format },
    { label: copy.tensorCount, value: document.tensorCount.toLocaleString(locale) },
    { label: copy.parameters, value: formatCount(document.totalParameters, locale) },
    { label: copy.weightSize, value: formatBytes(document.totalBytes, locale) },
    { label: copy.architecture, value: document.architecture ?? "", hidden: !document.architecture },
  ];

  const metaContent = document.metadata.length === 0
    ? el("p", "anyfile-inspector__muted", copy.metaEmpty)
    : createDataTable({
      columns: [
        { label: copy.key, width: "42%" },
        { label: copy.value, mono: true },
      ],
      rows: document.metadata.map((entry) => [entry.key, entry.value]),
      stickyHeader: false,
    }).element;

  shell.sidebar!.append(
    createKeyValueList(overviewItems),
    createSection(copy.metadata, metaContent, { headingLevel: 3 }),
  );

  const elementsOf = (shape: readonly number[]) => shape.reduce((product, dimension) => product * dimension, 1);
  let query = "";
  let sort: SortDirection = "none";

  const tensorTable = createDataTable({
    className: "anyfile-ml-weights-viewer__table",
    columns: [
      { label: copy.tensorName },
      { label: copy.dtype, width: "88px", mono: true },
      { label: copy.shape, mono: true },
      {
        label: copy.size,
        width: "104px",
        align: "end",
        mono: true,
        nowrap: true,
        sortable: true,
        initialSort: "desc",
        sortAscLabel: copy.sortAsc,
        sortDescLabel: copy.sortDesc,
      },
    ],
    emptyMessage: copy.empty,
    onSort: (_col, direction) => {
      sort = direction;
      render();
    },
  });

  const render = () => {
    let visible = query ? document.tensors.filter((tensor) => tensor.name.toLowerCase().includes(query)) : document.tensors;
    if (sort !== "none") {
      visible = [...visible].sort((a, b) => (sort === "asc" ? elementsOf(a.shape) - elementsOf(b.shape) : elementsOf(b.shape) - elementsOf(a.shape)));
    }
    const capped = visible.slice(0, MAX_ROWS);
    tensorTable.setRows(
      capped.map((tensor) => [
        tensor.name,
        tensor.dtype,
        `[${tensor.shape.join(" × ")}]`,
        formatBytes(tensor.bytes, locale),
      ]),
      { note: visible.length > MAX_ROWS ? copy.hidden : undefined },
    );
  };

  const filter = createFilterInput({
    placeholder: copy.filter,
    dataset: { mlWeightsFilter: "" },
    onInput: (nextQuery) => {
      query = nextQuery;
      render();
    },
  });
  shell.header.append(filter.input);
  shell.viewport.append(createSection(copy.tensors, tensorTable.element, {
    headingLevel: 3,
    className: "anyfile-ml-weights-viewer__tensors",
  }));
  shell.onDispose(() => {
    filter.dispose();
    tensorTable.dispose();
  });

  render();
  return { root: shell.root, dispose: () => shell.dispose() };
}
