import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { BinarySliceReport, NativeBinaryReport } from "./model";
import { nativeBinaryStyles } from "./styles";

type ViewTab = "all" | "overview" | "sections" | "dependencies" | "symbols";
const INITIAL_ROW_LIMIT = 400;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function matchesQuery(row: readonly string[], query: string): boolean {
  if (!query) return true;
  return row.some((cell) => cell.toLowerCase().includes(query));
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
  viewport.append(element("h2", title));
  if (rows.length === 0) {
    const empty = element("p", emptyText);
    empty.className = "anyfile-native-binary-viewer__empty";
    viewport.append(empty);
    return;
  }

  const showAll = expandedTables.has(tableKey);
  const visible = showAll ? rows : rows.slice(0, INITIAL_ROW_LIMIT);

  const wrap = element("div");
  wrap.className = "anyfile-native-binary-viewer__table-wrap";
  const table = element("table");
  const head = element("thead");
  const headerRow = element("tr");
  for (const header of headers) {
    const th = element("th", header);
    th.scope = "col";
    headerRow.append(th);
  }
  head.append(headerRow);

  const body = element("tbody");
  for (const values of visible) {
    const row = element("tr");
    values.forEach((value, colIdx) => {
      const cell = element("td", value);
      if (monoCols.has(colIdx)) cell.className = "anyfile-native-binary-viewer__mono";
      row.append(cell);
    });
    body.append(row);
  }
  table.append(head, body);
  wrap.append(table);
  viewport.append(wrap);

  if (!showAll && rows.length > INITIAL_ROW_LIMIT) {
    const more = element("button", showAllLabel(rows.length));
    more.type = "button";
    more.className = "anyfile-native-binary-viewer__more";
    more.addEventListener("click", () => {
      expandedTables.add(tableKey);
      rerender();
    });
    viewport.append(more);
  }
}

export function createNativeBinaryView(fileName: string, report: NativeBinaryReport, locale: Locale) {
  const copy = selectMessages(locale, {
    en: {
      banner: "Structural inspection only · not a decompiler or disassembler · never executed",
      sliceLabel: "Architecture slice",
      filterPlaceholder: "Filter sections, imports, symbols…",
      filterLabel: "Filter binary tables",
      tabAll: "All",
      tabOverview: "Overview",
      tabSections: "Sections",
      tabMembers: "Members",
      tabDeps: "Dependencies",
      tabSymbols: "Symbols",
      format: "Container",
      arch: "Architecture",
      kind: "Binary kind",
      endian: "Byte order",
      entry: "Entry point",
      fileSize: "File size",
      sectionsCount: "Sections",
      membersCount: "Members",
      depsCount: "Dependencies",
      symbolsCount: "Symbols",
      metadataTitle: "Headers & Metadata",
      segmentsTitle: "Program Headers / Segments / Directories",
      sectionsTitle: "Sections",
      membersTitle: "Archive Members",
      depsTitle: "Dependencies & Imports",
      symbolsTitle: "Symbols & Exports",
      empty: "None",
      colProperty: "Property",
      colValue: "Value",
      colName: "Name",
      colFlags: "Flags",
      colOffset: "Offset",
      colVaddr: "Virtual Addr",
      colFileSize: "File Size",
      colMemSize: "Mem Size",
      colDetail: "Details",
      colIndex: "#",
      colType: "Type",
      colSize: "Bytes",
      colKind: "Kind",
      colBinding: "Binding",
      colSection: "Section / Source",
      colMode: "Mode",
      colMtime: "Modified",
      showAll: (total: number) => `Show all ${total} rows`,
    },
    "zh-CN": {
      banner: "仅提供静态结构检查 · 非反编译或反汇编结果 · 绝不执行",
      sliceLabel: "架构切片",
      filterPlaceholder: "筛选段、依赖、符号…",
      filterLabel: "筛选二进制表格",
      tabAll: "全部",
      tabOverview: "概览",
      tabSections: "段与节",
      tabMembers: "成员",
      tabDeps: "依赖",
      tabSymbols: "符号",
      format: "容器格式",
      arch: "架构",
      kind: "类型",
      endian: "字节序",
      entry: "入口地址",
      fileSize: "文件大小",
      sectionsCount: "节数量",
      membersCount: "成员数",
      depsCount: "依赖项",
      symbolsCount: "符号数",
      metadataTitle: "头部与元数据",
      segmentsTitle: "程序头 / 段 / 数据目录",
      sectionsTitle: "节表（Sections）",
      membersTitle: "归档成员（Members）",
      depsTitle: "依赖与导入（Dependencies）",
      symbolsTitle: "符号与导出（Symbols）",
      empty: "无",
      colProperty: "属性",
      colValue: "值",
      colName: "名称",
      colFlags: "标志",
      colOffset: "文件偏移",
      colVaddr: "虚拟地址",
      colFileSize: "文件大小",
      colMemSize: "内存大小",
      colDetail: "详情",
      colIndex: "#",
      colType: "类型",
      colSize: "字节",
      colKind: "类别",
      colBinding: "绑定 / 序号",
      colSection: "所属节 / 来源",
      colMode: "权限",
      colMtime: "修改时间",
      showAll: (total: number) => `显示全部 ${total} 行`,
    },
  });

  const root = element("div");
  root.className = "anyfile-native-binary-viewer";
  const style = element("style");
  style.textContent = nativeBinaryStyles;

  const header = element("header");
  header.className = "anyfile-native-binary-viewer__header";
  const title = element("strong", fileName);
  title.className = "anyfile-native-binary-viewer__title";
  title.title = fileName;
  const banner = element("span", `${report.summary} · ${copy.banner}`);
  banner.className = "anyfile-native-binary-viewer__banner";
  header.append(title, banner);

  const toolbar = element("div");
  toolbar.className = "anyfile-native-binary-viewer__toolbar";

  let activeSliceIdx = 0;
  let activeTab: ViewTab = "all";
  let filterQuery = "";
  const expandedTables = new Set<string>();

  if (report.slices.length > 1) {
    const sliceSelect = element("select");
    sliceSelect.className = "anyfile-native-binary-viewer__select";
    sliceSelect.setAttribute("aria-label", copy.sliceLabel);
    report.slices.forEach((slice, idx) => {
      const option = element("option", slice.label);
      option.value = String(idx);
      sliceSelect.append(option);
    });
    sliceSelect.addEventListener("change", () => {
      activeSliceIdx = Number(sliceSelect.value) || 0;
      expandedTables.clear();
      renderViewport();
    });
    toolbar.append(sliceSelect);
  }

  const isArchive = report.format === "Unix Archive";
  const tabsWrap = element("div");
  tabsWrap.className = "anyfile-native-binary-viewer__tabs";
  const tabDefs: readonly [ViewTab, string][] = isArchive
    ? [["all", copy.tabAll], ["overview", copy.tabOverview], ["sections", copy.tabMembers]]
    : [
        ["all", copy.tabAll],
        ["overview", copy.tabOverview],
        ["sections", copy.tabSections],
        ["dependencies", copy.tabDeps],
        ["symbols", copy.tabSymbols],
      ];
  const tabButtons = new Map<ViewTab, HTMLButtonElement>();
  for (const [id, label] of tabDefs) {
    const btn = element("button", label);
    btn.type = "button";
    btn.className = "anyfile-native-binary-viewer__tab";
    btn.setAttribute("aria-pressed", id === activeTab ? "true" : "false");
    btn.addEventListener("click", () => {
      activeTab = id;
      for (const [tabId, button] of tabButtons) {
        button.setAttribute("aria-pressed", tabId === activeTab ? "true" : "false");
      }
      renderViewport();
    });
    tabButtons.set(id, btn);
    tabsWrap.append(btn);
  }
  toolbar.append(tabsWrap);

  const search = element("input");
  search.type = "search";
  search.className = "anyfile-native-binary-viewer__search";
  search.placeholder = copy.filterPlaceholder;
  search.setAttribute("aria-label", copy.filterLabel);
  search.addEventListener("input", () => {
    filterQuery = search.value.trim().toLowerCase();
    renderViewport();
  });
  toolbar.append(search);

  const viewport = element("div");
  viewport.className = "anyfile-native-binary-viewer__viewport";

  function renderSliceSummary(slice: BinarySliceReport) {
    const dl = element("dl");
    dl.className = "anyfile-native-binary-viewer__summary";
    const items: [string, string][] = [
      [copy.format, report.format],
      [copy.arch, slice.architecture],
      [copy.kind, slice.kind],
      [copy.endian, slice.endianness],
      [copy.entry, slice.entryPoint],
      [copy.fileSize, formatByteSize(report.fileSize)],
      isArchive
        ? [copy.membersCount, String(slice.totalMembers ?? slice.members?.length ?? 0)]
        : [copy.sectionsCount, String(slice.sections.length)],
      isArchive
        ? [copy.symbolsCount, String(slice.totalSymbols)]
        : [copy.depsCount, String(slice.dependencies.length)],
    ];
    if (!isArchive) items.push([copy.symbolsCount, String(slice.totalSymbols)]);
    for (const [term, value] of items) {
      const div = element("div");
      div.append(element("dt", term), element("dd", value));
      dl.append(div);
    }
    viewport.append(dl);

    for (const notice of slice.notices) {
      const p = element("p", notice);
      p.className = "anyfile-native-binary-viewer__notice";
      viewport.append(p);
    }
  }

  function renderViewport() {
    viewport.replaceChildren();
    const slice = report.slices[activeSliceIdx] ?? report.slices[0];
    if (!slice) return;

    renderSliceSummary(slice);

    if (activeTab === "all" || activeTab === "overview") {
      const metaRows = slice.metadata
        .map((m) => [m.key, m.value] as const)
        .filter((row) => matchesQuery(row, filterQuery));
      appendSectionTable(
        viewport, copy.metadataTitle, [copy.colProperty, copy.colValue], metaRows,
        copy.empty, new Set([1]), expandedTables, "meta", copy.showAll, renderViewport,
      );

      if (!isArchive) {
        const segRows = slice.segments
          .map((s) => [s.name, s.flags, s.offset, s.virtualAddress, s.fileSize, s.memorySize, s.detail] as const)
          .filter((row) => matchesQuery(row, filterQuery));
        appendSectionTable(
          viewport,
          copy.segmentsTitle,
          [copy.colName, copy.colFlags, copy.colOffset, copy.colVaddr, copy.colFileSize, copy.colMemSize, copy.colDetail],
          segRows,
          copy.empty,
          new Set([2, 3, 4, 5]),
          expandedTables,
          "segments",
          copy.showAll,
          renderViewport,
        );
      }
    }

    if (activeTab === "all" || activeTab === "sections") {
      if (isArchive && slice.members) {
        const memberRows = slice.members
          .map((m) => [String(m.index), m.name, m.kind, String(m.size), m.mode, `0x${m.offset.toString(16)}`, m.mtime] as const)
          .filter((row) => matchesQuery(row, filterQuery));
        appendSectionTable(
          viewport,
          copy.membersTitle,
          [copy.colIndex, copy.colName, copy.colKind, copy.colSize, copy.colMode, copy.colOffset, copy.colMtime],
          memberRows,
          copy.empty,
          new Set([0, 3, 4, 5]),
          expandedTables,
          "members",
          copy.showAll,
          renderViewport,
        );
      } else {
        const secRows = slice.sections
          .map((s) => [String(s.index), s.name, s.type, s.flags, s.address, s.offset, String(s.size)] as const)
          .filter((row) => matchesQuery(row, filterQuery));
        appendSectionTable(
          viewport,
          copy.sectionsTitle,
          [copy.colIndex, copy.colName, copy.colType, copy.colFlags, copy.colVaddr, copy.colOffset, copy.colSize],
          secRows,
          copy.empty,
          new Set([0, 4, 5, 6]),
          expandedTables,
          "sections",
          copy.showAll,
          renderViewport,
        );
      }
    }

    if (!isArchive && (activeTab === "all" || activeTab === "dependencies")) {
      const depRows = slice.dependencies
        .map((d) => [d.kind, d.name, d.detail] as const)
        .filter((row) => matchesQuery(row, filterQuery));
      appendSectionTable(
        viewport,
        copy.depsTitle,
        [copy.colKind, copy.colName, copy.colDetail],
        depRows,
        copy.empty,
        new Set([1]),
        expandedTables,
        "deps",
        copy.showAll,
        renderViewport,
      );
    }

    if (!isArchive && (activeTab === "all" || activeTab === "symbols")) {
      const symRows = slice.symbols
        .map((s) => [s.name, s.kind, s.binding, s.section, s.value, s.size ?? "-"] as const)
        .filter((row) => matchesQuery(row, filterQuery));
      appendSectionTable(
        viewport,
        copy.symbolsTitle,
        [copy.colName, copy.colKind, copy.colBinding, copy.colSection, copy.colVaddr, copy.colSize],
        symRows,
        copy.empty,
        new Set([0, 4, 5]),
        expandedTables,
        "symbols",
        copy.showAll,
        renderViewport,
      );
    }
  }

  renderViewport();
  root.append(style, header, toolbar, viewport);
  return root;
}
