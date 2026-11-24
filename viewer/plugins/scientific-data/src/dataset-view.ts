import type { Locale } from "@anyfile/viewer-protocol";
import {
  createBadge,
  createDataTable,
  createKeyValueList,
  createNotice,
  createSection,
  createTabBar,
  el,
} from "@anyfile/viewer-ui";
import type { ScientificCopy } from "./copy";
import { createHeatmapView } from "./heatmap";
import type { AttributeItem, DatasetInfo, ScientificDataSource } from "./types";

const ROW_PAGE_SIZE = 50;
const COL_PAGE_SIZE = 16;
const HEATMAP_MAX_DIM = 256;

export function formatShape(shape?: readonly number[]): string {
  if (!shape) return "";
  if (shape.length === 0) return "scalar";
  return shape.join("×");
}

export function renderAttributesTable(attrs: readonly AttributeItem[], copy: ScientificCopy): HTMLElement {
  if (attrs.length === 0) {
    return el("p", "anyfile-inspector__muted", copy.noAttributes);
  }
  const table = createDataTable({
    columns: [
      { label: copy.colName, width: "24%", nowrap: true },
      { label: copy.colType, width: "16%", nowrap: true },
      { label: copy.colShape, width: "14%", nowrap: true },
      { label: copy.colValue },
    ],
    ariaLabel: copy.tabAttributes,
    emptyMessage: copy.noAttributes,
  });
  table.setRows(
    attrs.map((attr) => ({
      cells: [attr.name, attr.dtype, formatShape(attr.shape), attr.preview],
    })),
  );
  return table.element;
}

export function mountDatasetDetail(
  detailHost: HTMLElement,
  info: DatasetInfo,
  source: ScientificDataSource,
  copy: ScientificCopy,
  locale: Locale,
  isStale: () => boolean,
): () => void {
  const cleanups: (() => void)[] = [];
  let sliceToken = 0;
  let disposed = false;

  const canHeatmap = info.isNumeric && info.shape.length >= 2 && info.totalElements > 0;
  let activeTab: "data" | "heatmap" | "attrs" = "data";
  let rowAxis = 0;
  let colAxis = info.shape.length >= 2 ? 1 : 0;
  const fixedIndices = info.shape.map(() => 0);
  let rowOffset = 0;
  let colOffset = 0;

  const header = el(
    "div",
    "anyfile-sci__header",
    el("h2", "anyfile-sci__path", info.path),
    createBadge(info.dtype, "accent"),
    createBadge(formatShape(info.shape)),
    createBadge(`${info.totalElements.toLocaleString(locale)} ${copy.elementsLabel}`),
  );

  const tabs = createTabBar({
    activeId: activeTab,
    items: [
      { id: "data", label: copy.tabData },
      ...(canHeatmap ? [{ id: "heatmap", label: copy.tabHeatmap }] : []),
      { id: "attrs", label: `${copy.tabAttributes} (${info.attributes.length})` },
    ],
    onChange: (id) => {
      activeTab = id as "data" | "heatmap" | "attrs";
      void renderActiveTab();
    },
  });
  cleanups.push(() => tabs.dispose());

  const controlsHost = el("div");
  const tabContent = el("div");
  let disposeHeatmap: (() => void) | undefined;
  cleanups.push(() => disposeHeatmap?.());

  function renderSliceControls() {
    if (info.shape.length < 3 || activeTab === "attrs") {
      controlsHost.replaceChildren();
      return;
    }
    const bar = el("div", "anyfile-sci__controls");
    const axisLabel = (idx: number) =>
      info.dimensionNames?.[idx]
        ? `${info.dimensionNames[idx]} (${info.shape[idx]})`
        : `${copy.fixedIndex} ${idx} (${info.shape[idx]})`;

    const rowSel = el("select", "anyfile-sci__select");
    const colSel = el("select", "anyfile-sci__select");
    for (let i = 0; i < info.shape.length; i += 1) {
      const o1 = el("option", undefined, axisLabel(i));
      o1.value = String(i);
      rowSel.append(o1);
      const o2 = el("option", undefined, axisLabel(i));
      o2.value = String(i);
      colSel.append(o2);
    }
    rowSel.value = String(rowAxis);
    colSel.value = String(colAxis);
    rowSel.addEventListener("change", () => {
      const next = Number(rowSel.value);
      if (next === colAxis) colAxis = rowAxis;
      rowAxis = next;
      rowOffset = 0;
      colOffset = 0;
      renderSliceControls();
      void renderActiveTab();
    });
    colSel.addEventListener("change", () => {
      const next = Number(colSel.value);
      if (next === rowAxis) rowAxis = colAxis;
      colAxis = next;
      rowOffset = 0;
      colOffset = 0;
      renderSliceControls();
      void renderActiveTab();
    });
    bar.append(
      el("label", "anyfile-sci__field", el("span", undefined, copy.rowAxis), rowSel),
      el("label", "anyfile-sci__field", el("span", undefined, copy.colAxis), colSel),
    );
    for (let i = 0; i < info.shape.length; i += 1) {
      if (i === rowAxis || i === colAxis) continue;
      const input = el("input", "anyfile-sci__num");
      input.type = "number";
      input.min = "0";
      input.max = String(Math.max(0, info.shape[i] - 1));
      input.value = String(fixedIndices[i] ?? 0);
      input.addEventListener("change", () => {
        const clamped = Math.max(0, Math.min(Number(input.value) || 0, Math.max(0, info.shape[i] - 1)));
        fixedIndices[i] = clamped;
        input.value = String(clamped);
        void renderActiveTab();
      });
      bar.append(el("label", "anyfile-sci__field", el("span", undefined, axisLabel(i)), input));
    }
    controlsHost.replaceChildren(bar);
  }

  async function renderActiveTab() {
    const sToken = ++sliceToken;
    disposeHeatmap?.();
    disposeHeatmap = undefined;
    renderSliceControls();

    if (activeTab === "attrs") {
      const metaItems = [
        { label: copy.dtypeLabel, value: info.dtype, mono: true },
        { label: copy.shapeLabel, value: formatShape(info.shape), mono: true },
        { label: copy.elementsLabel, value: info.totalElements.toLocaleString(locale) },
        { label: copy.orderLabel, value: info.order === "F" ? "Fortran (column-major)" : "C (row-major)" },
      ];
      if (info.dimensionNames) metaItems.push({ label: copy.dimensionsLabel, value: info.dimensionNames.join(", ") });
      if (info.chunks) metaItems.push({ label: copy.chunksLabel, value: formatShape(info.chunks), mono: true });
      if (info.filters && info.filters.length > 0) {
        metaItems.push({ label: copy.filtersLabel, value: info.filters.join(", ") });
      }
      tabContent.replaceChildren(
        createKeyValueList(metaItems),
        createSection(`${copy.tabAttributes} (${info.attributes.length})`, renderAttributesTable(info.attributes, copy)),
      );
      return;
    }

    if (info.totalElements === 0) {
      tabContent.replaceChildren(el("p", "anyfile-inspector__muted", copy.emptyDataset));
      return;
    }

    if (activeTab === "heatmap") {
      try {
        const result = await source.readHeatmap({
          path: info.path,
          fixedIndices,
          rowAxis,
          colAxis,
          maxDim: HEATMAP_MAX_DIM,
        });
        if (disposed || isStale() || sToken !== sliceToken) return;
        const view = createHeatmapView(result, copy);
        disposeHeatmap = () => view.dispose();
        tabContent.replaceChildren(view.element);
      } catch {
        if (!disposed && !isStale() && sToken === sliceToken) {
          tabContent.replaceChildren(createNotice(copy.loadError, "warning"));
        }
      }
      return;
    }

    try {
      const slice = await source.readSlice({
        path: info.path,
        fixedIndices,
        rowAxis,
        colAxis,
        rowOffset,
        rowCount: ROW_PAGE_SIZE,
        colOffset,
        colCount: COL_PAGE_SIZE,
      });
      if (disposed || isStale() || sToken !== sliceToken) return;
      const columns = slice.compoundColumns
        ? [{ label: "#" }, ...slice.compoundColumns.map((name) => ({ label: name }))]
        : [
            { label: "#" },
            ...Array.from({ length: slice.cols }, (_, c) => ({
              label: slice.totalCols === 1 ? copy.colValue : `[${slice.colOffset + c}]`,
              align: info.isNumeric ? ("end" as const) : ("start" as const),
            })),
          ];
      const table = createDataTable({
        columns,
        ariaLabel: info.name,
        emptyMessage: copy.emptyDataset,
      });
      const rows = [];
      for (let r = 0; r < slice.rows; r += 1) {
        const cells = [String(slice.rowOffset + r)];
        for (let c = 0; c < slice.cols; c += 1) {
          cells.push(slice.values[r * slice.cols + c] ?? "—");
        }
        rows.push({ cells });
      }
      table.setRows(rows);

      const pager = el("div", "anyfile-sci__pager");
      const prevRowBtn = el("button", "anyfile-sci__btn", copy.prevRows);
      prevRowBtn.type = "button";
      prevRowBtn.disabled = rowOffset === 0;
      prevRowBtn.addEventListener("click", () => {
        rowOffset = Math.max(0, rowOffset - ROW_PAGE_SIZE);
        void renderActiveTab();
      });
      const nextRowBtn = el("button", "anyfile-sci__btn", copy.nextRows);
      nextRowBtn.type = "button";
      nextRowBtn.disabled = rowOffset + slice.rows >= slice.totalRows;
      nextRowBtn.addEventListener("click", () => {
        rowOffset += ROW_PAGE_SIZE;
        void renderActiveTab();
      });
      pager.append(
        prevRowBtn,
        nextRowBtn,
        el(
          "span",
          "anyfile-sci__mono",
          copy.rowsRange(slice.rowOffset, Math.max(slice.rowOffset, slice.rowOffset + slice.rows - 1), slice.totalRows),
        ),
      );

      if (slice.totalCols > COL_PAGE_SIZE && !slice.compoundColumns) {
        const prevColBtn = el("button", "anyfile-sci__btn", copy.prevCols);
        prevColBtn.type = "button";
        prevColBtn.disabled = colOffset === 0;
        prevColBtn.addEventListener("click", () => {
          colOffset = Math.max(0, colOffset - COL_PAGE_SIZE);
          void renderActiveTab();
        });
        const nextColBtn = el("button", "anyfile-sci__btn", copy.nextCols);
        nextColBtn.type = "button";
        nextColBtn.disabled = colOffset + slice.cols >= slice.totalCols;
        nextColBtn.addEventListener("click", () => {
          colOffset += COL_PAGE_SIZE;
          void renderActiveTab();
        });
        pager.append(
          prevColBtn,
          nextColBtn,
          el(
            "span",
            "anyfile-sci__mono",
            copy.colsRange(slice.colOffset, Math.max(slice.colOffset, slice.colOffset + slice.cols - 1), slice.totalCols),
          ),
        );
      }
      tabContent.replaceChildren(pager, table.element);
    } catch {
      if (!disposed && !isStale() && sToken === sliceToken) {
        tabContent.replaceChildren(createNotice(copy.loadError, "warning"));
      }
    }
  }

  detailHost.replaceChildren(header, tabs.element, controlsHost, tabContent);
  void renderActiveTab();

  return () => {
    disposed = true;
    sliceToken += 1;
    for (const fn of cleanups) fn();
    cleanups.length = 0;
  };
}
