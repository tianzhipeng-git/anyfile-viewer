import type { Locale } from "@anyfile/viewer-protocol";
import {
  createBadge,
  createDataTable,
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createNotice,
  createSection,
  el,
  formatBytes,
  viewerTheme,
} from "@anyfile/viewer-ui";
import type { ScientificCopy } from "./copy";
import { formatShape, mountDatasetDetail, renderAttributesTable } from "./dataset-view";
import type { DatasetInfo, GroupInfo, ScientificDataSource, TreeNode } from "./types";

const extraStyles = `
  .anyfile-sci .anyfile-inspector__sidebar { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .anyfile-sci__tree-wrap { flex: 1; min-height: 0; overflow: auto; }
  .anyfile-sci__tree, .anyfile-sci__tree ul { list-style: none; margin: 0; padding: 0; }
  .anyfile-sci__tree ul { padding-inline-start: 14px; }
  .anyfile-sci__row { display: flex; align-items: center; gap: 2px; }
  .anyfile-sci__toggle { width: 18px; flex: none; border: 0; background: none; color: ${viewerTheme.muted}; cursor: pointer; padding: 0; font: inherit; }
  .anyfile-sci__node { flex: 1; min-width: 0; display: flex; justify-content: space-between; align-items: center; gap: 6px;
    border: 0; background: none; color: inherit; font: inherit; text-align: start; padding: 4px 6px; border-radius: 4px; cursor: pointer; }
  .anyfile-sci__node:hover { background: ${viewerTheme.surface}; }
  .anyfile-sci__node[aria-current="true"] { background: ${viewerTheme.accent}; color: ${viewerTheme.accentForeground}; }
  .anyfile-sci__node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .anyfile-sci__node-meta { flex: none; font-family: ${viewerTheme.fontMono}; font-size: 11px; opacity: 0.72; }
  .anyfile-sci__detail { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .anyfile-sci__header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .anyfile-sci__path { font-family: ${viewerTheme.fontMono}; font-size: 14px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
  .anyfile-sci__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 10px;
    background: ${viewerTheme.surface}; border: 1px solid ${viewerTheme.border}; border-radius: 6px; font-size: 12px; }
  .anyfile-sci__field { display: inline-flex; align-items: center; gap: 6px; }
  .anyfile-sci__select, .anyfile-sci__num { border: 1px solid ${viewerTheme.border}; border-radius: 4px;
    background: ${viewerTheme.background}; color: ${viewerTheme.foreground}; padding: 3px 6px; font: inherit; }
  .anyfile-sci__num { width: 72px; font-family: ${viewerTheme.fontMono}; }
  .anyfile-sci__pager { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
  .anyfile-sci__btn { border: 1px solid ${viewerTheme.border}; border-radius: 4px; background: ${viewerTheme.surface};
    color: ${viewerTheme.foreground}; padding: 3px 8px; cursor: pointer; font: inherit; }
  .anyfile-sci__btn:disabled { opacity: 0.45; cursor: default; }
  .anyfile-sci__mono { font-family: ${viewerTheme.fontMono}; font-size: 12px; }
  .anyfile-sci__heatmap { display: flex; flex-direction: column; gap: 10px; }
  .anyfile-sci__heatmap-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 12px; }
  .anyfile-sci__canvas-wrap { display: flex; justify-content: center; align-items: center; padding: 10px;
    background: ${viewerTheme.surface}; border: 1px solid ${viewerTheme.border}; border-radius: 6px; overflow: auto; }
  .anyfile-sci__canvas { max-width: 100%; max-height: 460px; width: auto; height: auto; image-rendering: pixelated; cursor: crosshair;
    min-width: 240px; min-height: 160px; object-fit: contain; }
  .anyfile-sci__legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .anyfile-sci__colorbar { width: 160px; height: 12px; border-radius: 3px; border: 1px solid ${viewerTheme.border}; }
  .anyfile-sci__hover { margin-inline-start: auto; }
`;

export function createScientificDataView(
  fileName: string,
  source: ScientificDataSource,
  copy: ScientificCopy,
  locale: Locale,
) {
  const { summary } = source;
  const shell = createInspectorShell({
    className: "anyfile-sci",
    title: fileName,
    subtitle: summary.formatDetail,
    badges: [
      { text: summary.formatDetail, tone: "accent" },
      { text: formatBytes(summary.fileSize, locale) },
    ],
    layout: "split",
    extraStyles,
  });

  let disposed = false;
  let detailToken = 0;
  let selectedPath = "/";
  let filterQuery = "";
  const expanded = new Set<string>(["/"]);
  const groupCache = new Map<string, GroupInfo>([
    ["/", { path: "/", name: "/", children: summary.rootChildren, attributes: summary.rootAttributes }],
  ]);
  const cleanups: (() => void)[] = [];
  let detailCleanups: (() => void)[] = [];

  const clearDetailCleanups = () => {
    for (const fn of detailCleanups) fn();
    detailCleanups = [];
  };

  shell.onDispose(() => {
    disposed = true;
    detailToken += 1;
    clearDetailCleanups();
    for (const fn of cleanups) fn();
    cleanups.length = 0;
  });

  const filter = createFilterInput({
    placeholder: copy.filterPlaceholder,
    ariaLabel: copy.filterPlaceholder,
    onInput: (value) => {
      filterQuery = value;
      renderTree();
    },
  });
  cleanups.push(() => filter.dispose());

  const treeWrap = el("div", "anyfile-sci__tree-wrap");
  const detailHost = el("div", "anyfile-sci__detail");
  shell.sidebar?.append(filter.input, treeWrap);
  shell.viewport.append(detailHost);

  function matchesFilter(node: TreeNode): boolean {
    if (!filterQuery) return true;
    if (node.name.toLowerCase().includes(filterQuery) || node.path.toLowerCase().includes(filterQuery)) {
      return true;
    }
    const cached = groupCache.get(node.path);
    return cached ? cached.children.some(matchesFilter) : false;
  }

  function renderNodes(nodes: readonly TreeNode[]): HTMLUListElement {
    const ul = el("ul");
    for (const node of nodes) {
      if (!matchesFilter(node)) continue;
      const li = el("li");
      const row = el("div", "anyfile-sci__row");
      const isGroup = node.kind === "group";
      const toggle = el("button", "anyfile-sci__toggle", isGroup ? (expanded.has(node.path) ? "▾" : "▸") : "");
      toggle.type = "button";
      toggle.disabled = !isGroup;
      toggle.setAttribute("aria-label", node.name);
      if (isGroup) toggle.addEventListener("click", () => void toggleGroup(node.path));

      const btn = el("button", "anyfile-sci__node");
      btn.type = "button";
      btn.dataset.sciPath = node.path;
      if (selectedPath === node.path) btn.setAttribute("aria-current", "true");
      const metaText =
        node.kind === "dataset"
          ? `${node.dtype ?? ""} ${formatShape(node.shape)}`.trim()
          : node.kind === "group" && node.childCount !== undefined
            ? `(${node.childCount})`
            : node.kind === "soft-link" || node.kind === "external-link"
              ? "↗"
              : "";
      btn.append(el("span", "anyfile-sci__node-name", node.name), el("span", "anyfile-sci__node-meta", metaText));
      btn.addEventListener("click", () => {
        if (isGroup) void selectGroup(node.path);
        else if (node.kind === "dataset") void selectDataset(node.path);
        else renderLinkDetail(node);
      });

      row.append(toggle, btn);
      li.append(row);
      if (isGroup && expanded.has(node.path)) {
        const cached = groupCache.get(node.path);
        if (cached && cached.children.length > 0) li.append(renderNodes(cached.children));
      }
      ul.append(li);
    }
    return ul;
  }

  function renderTree() {
    if (disposed) return;
    const rootUl = el("ul", "anyfile-sci__tree");
    const rootLi = el("li");
    const rootRow = el("div", "anyfile-sci__row");
    const rootBtn = el("button", "anyfile-sci__node");
    rootBtn.type = "button";
    rootBtn.dataset.sciPath = "/";
    if (selectedPath === "/") rootBtn.setAttribute("aria-current", "true");
    rootBtn.append(
      el("span", "anyfile-sci__node-name", `/ (${copy.rootOverview})`),
      el("span", "anyfile-sci__node-meta", `(${summary.rootChildren.length})`),
    );
    rootBtn.addEventListener("click", () => void selectGroup("/"));
    rootRow.append(el("span", "anyfile-sci__toggle", "▾"), rootBtn);
    rootLi.append(rootRow);

    const childrenList = renderNodes(summary.rootChildren);
    if (childrenList.childElementCount === 0 && filterQuery) {
      rootLi.append(el("p", "anyfile-inspector__muted", copy.noMatches));
    } else {
      rootLi.append(childrenList);
    }
    rootUl.append(rootLi);
    treeWrap.replaceChildren(rootUl);
  }

  async function toggleGroup(path: string) {
    if (expanded.has(path)) {
      expanded.delete(path);
      renderTree();
      return;
    }
    if (!groupCache.has(path)) {
      try {
        const info = await source.listGroup(path);
        if (disposed) return;
        groupCache.set(path, info);
      } catch {
        return;
      }
    }
    expanded.add(path);
    renderTree();
  }

  function renderLinkDetail(node: TreeNode) {
    clearDetailCleanups();
    selectedPath = node.path;
    renderTree();
    detailHost.replaceChildren(
      el("div", "anyfile-sci__header", el("h2", "anyfile-sci__path", node.path), createBadge(copy.kindLink, "neutral")),
      createKeyValueList([{ label: copy.colValue, value: node.linkTarget || "—", mono: true }]),
    );
  }

  async function selectGroup(path: string) {
    const token = ++detailToken;
    selectedPath = path;
    renderTree();
    let group = groupCache.get(path);
    if (!group) {
      try {
        group = await source.listGroup(path);
        if (disposed || token !== detailToken) return;
        groupCache.set(path, group);
      } catch {
        if (!disposed && token === detailToken) detailHost.replaceChildren(createNotice(copy.loadError, "warning"));
        return;
      }
    }
    if (disposed || token !== detailToken) return;
    clearDetailCleanups();

    const parts: HTMLElement[] = [
      el("div", "anyfile-sci__header", el("h2", "anyfile-sci__path", path === "/" ? copy.rootOverview : path)),
    ];
    if (path === "/") {
      const kvItems = [
        { label: copy.formatLabel, value: summary.formatDetail },
        { label: copy.fileSizeLabel, value: formatBytes(summary.fileSize, locale) },
      ];
      if (summary.dimensions && summary.dimensions.length > 0) {
        kvItems.push({
          label: copy.dimensionsLabel,
          value: summary.dimensions.map((d) => `${d.name}=${d.size}${d.unlimited ? " (unlimited)" : ""}`).join(", "),
        });
      }
      parts.push(createKeyValueList(kvItems));
      if (summary.notes) {
        for (const note of summary.notes) parts.push(createNotice(note, "info"));
      }
    }
    if (group.truncated) parts.push(createNotice(copy.truncatedGroup, "info"));

    const childTable = createDataTable({
      columns: [
        { label: copy.colName },
        { label: copy.colKind, width: "14%", nowrap: true },
        { label: copy.colType, width: "18%", nowrap: true },
        { label: copy.colShape, width: "18%", nowrap: true },
      ],
      ariaLabel: copy.groupsAndDatasets,
      emptyMessage: copy.emptyGroup,
    });
    detailCleanups.push(() => childTable.dispose());
    childTable.setRows(
      group.children.map((child) => ({
        cells: [
          child.name,
          child.kind === "group" ? copy.kindGroup : child.kind === "dataset" ? copy.kindDataset : copy.kindLink,
          child.dtype ?? "—",
          child.kind === "dataset" ? formatShape(child.shape) : child.childCount !== undefined ? `${child.childCount} items` : "—",
        ],
        interactive: true,
        dataset: { childPath: child.path, childKind: child.kind },
      })),
    );
    const onRowClick = (event: MouseEvent) => {
      const tr = (event.target as HTMLElement | null)?.closest<HTMLTableRowElement>("tr[data-child-path]");
      if (!tr?.dataset.childPath) return;
      if (tr.dataset.childKind === "group") void selectGroup(tr.dataset.childPath);
      else if (tr.dataset.childKind === "dataset") void selectDataset(tr.dataset.childPath);
    };
    childTable.element.addEventListener("click", onRowClick);
    detailCleanups.push(() => childTable.element.removeEventListener("click", onRowClick));

    parts.push(
      createSection(`${copy.groupsAndDatasets} (${group.children.length})`, childTable.element),
      createSection(`${copy.tabAttributes} (${group.attributes.length})`, renderAttributesTable(group.attributes, copy)),
    );
    detailHost.replaceChildren(...parts);
  }

  async function selectDataset(path: string) {
    const token = ++detailToken;
    selectedPath = path;
    renderTree();
    let info: DatasetInfo;
    try {
      info = await source.inspectDataset(path);
    } catch {
      if (!disposed && token === detailToken) detailHost.replaceChildren(createNotice(copy.loadError, "warning"));
      return;
    }
    if (disposed || token !== detailToken) return;
    clearDetailCleanups();
    detailCleanups.push(
      mountDatasetDetail(detailHost, info, source, copy, locale, () => disposed || token !== detailToken),
    );
  }

  renderTree();
  void selectGroup("/");

  return {
    root: shell.root,
    dispose() {
      shell.dispose();
    },
  };
}
