import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createNotice,
  createSection,
  createTabBar,
  el,
  formatBytes,
} from "@anyfile/viewer-ui";

import type { BinarySliceReport, NativeBinaryReport } from "./model";

type ViewTab = "all" | "overview" | "sections" | "dependencies" | "symbols";
const INITIAL_ROW_LIMIT = 400;

const extraStyles = `
  .anyfile-native-binary-viewer__more { margin-top:8px; }
  .anyfile-native-binary-viewer__search { margin-inline-start:auto; max-width:260px; }
`;

function matchesQuery(row: readonly string[], query: string): boolean {
  return !query || row.some((cell) => cell.toLowerCase().includes(query));
}

function appendSectionTable(
  viewport: HTMLElement,
  title: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  emptyText: string,
  monoCols: ReadonlySet<number>,
  expandedTables: Set<string>,
  tableKey: string,
  showAllLabel: (count: number) => string,
  rerender: () => void,
) {
  if (rows.length === 0) {
    viewport.append(createSection(title, el("p", "anyfile-inspector__muted", emptyText)));
    return;
  }

  const showAll = expandedTables.has(tableKey);
  const visible = showAll ? rows : rows.slice(0, INITIAL_ROW_LIMIT);
  const table = createDataTable({
    columns: headers.map((label, index) => ({ label, mono: monoCols.has(index) })),
    rows: visible,
    stickyHeader: false,
    bordered: true,
  });

  const children: HTMLElement[] = [table.element];
  if (!showAll && rows.length > INITIAL_ROW_LIMIT) {
    const more = el("button", {
      className: "anyfile-inspector__btn anyfile-native-binary-viewer__more",
      attrs: { type: "button" },
    }, showAllLabel(rows.length));
    more.addEventListener("click", () => {
      expandedTables.add(tableKey);
      rerender();
    });
    children.push(more);
  }
  viewport.append(createSection(title, children));
}

export function createNativeBinaryView(fileName: string, report: NativeBinaryReport, locale: Locale) {
  const copy = selectMessages(locale, {
    en: {
      banner: "Structural inspection only · not a decompiler or disassembler · never executed",
      sliceLabel: "Architecture slice",
      filterPlaceholder: "Filter sections, imports, symbols…",
      filterLabel: "Filter binary tables",
      tabAll: "All", tabOverview: "Overview", tabSections: "Sections", tabMembers: "Members",
      tabDeps: "Dependencies", tabSymbols: "Symbols", format: "Container", arch: "Architecture",
      kind: "Binary kind", endian: "Byte order", entry: "Entry point", fileSize: "File size",
      sectionsCount: "Sections", membersCount: "Members", depsCount: "Dependencies", symbolsCount: "Symbols",
      metadataTitle: "Headers & Metadata", segmentsTitle: "Program Headers / Segments / Directories",
      sectionsTitle: "Sections", membersTitle: "Archive Members", depsTitle: "Dependencies & Imports",
      symbolsTitle: "Symbols & Exports", empty: "None", colProperty: "Property", colValue: "Value",
      colName: "Name", colFlags: "Flags", colOffset: "Offset", colVaddr: "Virtual Addr",
      colFileSize: "File Size", colMemSize: "Mem Size", colDetail: "Details", colIndex: "#",
      colType: "Type", colSize: "Bytes", colKind: "Kind", colBinding: "Binding",
      colSection: "Section / Source", colMode: "Mode", colMtime: "Modified",
      showAll: (total: number) => `Show all ${total} rows`,
    },
    "zh-CN": {
      banner: "仅提供静态结构检查 · 非反编译或反汇编结果 · 绝不执行",
      sliceLabel: "架构切片",
      filterPlaceholder: "筛选段、依赖、符号…",
      filterLabel: "筛选二进制表格",
      tabAll: "全部", tabOverview: "概览", tabSections: "段与节", tabMembers: "成员",
      tabDeps: "依赖", tabSymbols: "符号", format: "容器格式", arch: "架构",
      kind: "类型", endian: "字节序", entry: "入口地址", fileSize: "文件大小",
      sectionsCount: "节数量", membersCount: "成员数", depsCount: "依赖项", symbolsCount: "符号数",
      metadataTitle: "头部与元数据", segmentsTitle: "程序头 / 段 / 数据目录",
      sectionsTitle: "节表（Sections）", membersTitle: "归档成员（Members）",
      depsTitle: "依赖与导入（Dependencies）", symbolsTitle: "符号与导出（Symbols）",
      empty: "无", colProperty: "属性", colValue: "值", colName: "名称", colFlags: "标志",
      colOffset: "文件偏移", colVaddr: "虚拟地址", colFileSize: "文件大小", colMemSize: "内存大小",
      colDetail: "详情", colIndex: "#", colType: "类型", colSize: "字节", colKind: "类别",
      colBinding: "绑定 / 序号", colSection: "所属节 / 来源", colMode: "权限", colMtime: "修改时间",
      showAll: (total: number) => `显示全部 ${total} 行`,
    },
  });

  const shell = createInspectorShell({
    className: "anyfile-native-binary-viewer",
    title: fileName,
    subtitle: `${report.summary} · ${copy.banner}`,
    extraStyles,
  });

  let activeSliceIdx = 0;
  let activeTab: ViewTab = "all";
  let filterQuery = "";
  const expandedTables = new Set<string>();
  const isArchive = report.format === "Unix Archive";

  if (report.slices.length > 1) {
    const sliceSelect = el("select", {
      className: "anyfile-inspector__select",
      attrs: { "aria-label": copy.sliceLabel },
    });
    report.slices.forEach((slice, idx) => {
      const option = el("option", undefined, slice.label);
      option.value = String(idx);
      sliceSelect.append(option);
    });
    const onSliceChange = () => {
      activeSliceIdx = Number(sliceSelect.value) || 0;
      expandedTables.clear();
      renderViewport();
    };
    sliceSelect.addEventListener("change", onSliceChange);
    shell.onDispose(() => sliceSelect.removeEventListener("change", onSliceChange));
    shell.toolbar.append(sliceSelect);
  }

  const tabItems: readonly { id: ViewTab; label: string }[] = isArchive
    ? [{ id: "all", label: copy.tabAll }, { id: "overview", label: copy.tabOverview }, { id: "sections", label: copy.tabMembers }]
    : [
      { id: "all", label: copy.tabAll },
      { id: "overview", label: copy.tabOverview },
      { id: "sections", label: copy.tabSections },
      { id: "dependencies", label: copy.tabDeps },
      { id: "symbols", label: copy.tabSymbols },
    ];
  const tabs = createTabBar<ViewTab>({
    items: tabItems,
    activeId: activeTab,
    onChange: (id) => {
      activeTab = id;
      renderViewport();
    },
  });
  shell.toolbar.append(tabs.element);

  const filter = createFilterInput({
    placeholder: copy.filterPlaceholder,
    ariaLabel: copy.filterLabel,
    className: "anyfile-native-binary-viewer__search",
    onInput: (query) => {
      filterQuery = query;
      renderViewport();
    },
  });
  shell.toolbar.append(filter.input);
  shell.onDispose(() => {
    tabs.dispose();
    filter.dispose();
  });

  function renderSliceSummary(slice: BinarySliceReport) {
    const items = [
      { label: copy.format, value: report.format },
      { label: copy.arch, value: slice.architecture },
      { label: copy.kind, value: slice.kind },
      { label: copy.endian, value: slice.endianness },
      { label: copy.entry, value: slice.entryPoint, mono: true },
      { label: copy.fileSize, value: formatBytes(report.fileSize, locale) },
      isArchive
        ? { label: copy.membersCount, value: String(slice.totalMembers ?? slice.members?.length ?? 0) }
        : { label: copy.sectionsCount, value: String(slice.sections.length) },
      isArchive
        ? { label: copy.symbolsCount, value: String(slice.totalSymbols) }
        : { label: copy.depsCount, value: String(slice.dependencies.length) },
      { label: copy.symbolsCount, value: String(slice.totalSymbols), hidden: isArchive },
    ];
    shell.viewport.append(createKeyValueList(items, { variant: "cards" }));
    for (const notice of slice.notices) {
      shell.viewport.append(createNotice(notice, "info"));
    }
  }

  function renderViewport() {
    shell.viewport.replaceChildren();
    const slice = report.slices[activeSliceIdx] ?? report.slices[0];
    if (!slice) return;

    renderSliceSummary(slice);

    if (activeTab === "all" || activeTab === "overview") {
      const metaRows = slice.metadata.map((m) => [m.key, m.value] as const).filter((row) => matchesQuery(row, filterQuery));
      appendSectionTable(
        shell.viewport, copy.metadataTitle, [copy.colProperty, copy.colValue], metaRows,
        copy.empty, new Set([1]), expandedTables, "meta", copy.showAll, renderViewport,
      );

      if (!isArchive) {
        const segRows = slice.segments
          .map((s) => [s.name, s.flags, s.offset, s.virtualAddress, s.fileSize, s.memorySize, s.detail] as const)
          .filter((row) => matchesQuery(row, filterQuery));
        appendSectionTable(
          shell.viewport, copy.segmentsTitle,
          [copy.colName, copy.colFlags, copy.colOffset, copy.colVaddr, copy.colFileSize, copy.colMemSize, copy.colDetail],
          segRows, copy.empty, new Set([2, 3, 4, 5]), expandedTables, "segments", copy.showAll, renderViewport,
        );
      }
    }

    if (activeTab === "all" || activeTab === "sections") {
      if (isArchive && slice.members) {
        const memberRows = slice.members
          .map((m) => [String(m.index), m.name, m.kind, String(m.size), m.mode, `0x${m.offset.toString(16)}`, m.mtime] as const)
          .filter((row) => matchesQuery(row, filterQuery));
        appendSectionTable(
          shell.viewport, copy.membersTitle,
          [copy.colIndex, copy.colName, copy.colKind, copy.colSize, copy.colMode, copy.colOffset, copy.colMtime],
          memberRows, copy.empty, new Set([0, 3, 4, 5]), expandedTables, "members", copy.showAll, renderViewport,
        );
      } else {
        const secRows = slice.sections
          .map((s) => [String(s.index), s.name, s.type, s.flags, s.address, s.offset, String(s.size)] as const)
          .filter((row) => matchesQuery(row, filterQuery));
        appendSectionTable(
          shell.viewport, copy.sectionsTitle,
          [copy.colIndex, copy.colName, copy.colType, copy.colFlags, copy.colVaddr, copy.colOffset, copy.colSize],
          secRows, copy.empty, new Set([0, 4, 5, 6]), expandedTables, "sections", copy.showAll, renderViewport,
        );
      }
    }

    if (!isArchive && (activeTab === "all" || activeTab === "dependencies")) {
      const depRows = slice.dependencies
        .map((d) => [d.kind, d.name, d.detail] as const)
        .filter((row) => matchesQuery(row, filterQuery));
      appendSectionTable(
        shell.viewport, copy.depsTitle, [copy.colKind, copy.colName, copy.colDetail],
        depRows, copy.empty, new Set([1]), expandedTables, "deps", copy.showAll, renderViewport,
      );
    }

    if (!isArchive && (activeTab === "all" || activeTab === "symbols")) {
      const symRows = slice.symbols
        .map((s) => [s.name, s.kind, s.binding, s.section, s.value, s.size ?? "-"] as const)
        .filter((row) => matchesQuery(row, filterQuery));
      appendSectionTable(
        shell.viewport, copy.symbolsTitle,
        [copy.colName, copy.colKind, copy.colBinding, copy.colSection, copy.colVaddr, copy.colSize],
        symRows, copy.empty, new Set([0, 4, 5]), expandedTables, "symbols", copy.showAll, renderViewport,
      );
    }
  }

  renderViewport();
  return { root: shell.root, dispose: () => shell.dispose() };
}
