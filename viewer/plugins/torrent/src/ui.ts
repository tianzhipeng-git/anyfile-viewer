import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createSection,
  el,
  formatBytes,
  viewerTheme,
  type KeyValueItem,
  type SortDirection,
} from "@anyfile/viewer-ui";

import type { TorrentDocument } from "./types";

function copyFor(locale: Locale) {
  return selectMessages(locale, { "zh-CN": {
    overview: "概览", files: "文件", trackers: "Tracker", webSeeds: "Web 种子",
    name: "名称", totalSize: "总大小", fileCount: "文件数", infoHash: "InfoHash", pieceLength: "分块大小",
    pieces: "分块数", private: "私有种子", createdBy: "创建工具", creationDate: "创建时间", comment: "备注",
    yes: "是", no: "否", noData: "无", path: "路径", size: "大小", copy: "复制", copied: "已复制",
    filter: "筛选文件路径", empty: "没有匹配的文件", hidden: "文件过多，仅显示前 5000 个。",
    sortAsc: "按大小升序排列", sortDesc: "按大小降序排列",
  }, en: {
    overview: "Overview", files: "Files", trackers: "Trackers", webSeeds: "Web seeds",
    name: "Name", totalSize: "Total size", fileCount: "Files", infoHash: "InfoHash", pieceLength: "Piece length",
    pieces: "Pieces", private: "Private torrent", createdBy: "Created by", creationDate: "Created", comment: "Comment",
    yes: "Yes", no: "No", noData: "None", path: "Path", size: "Size", copy: "Copy", copied: "Copied",
    filter: "Filter file paths", empty: "No matching files", hidden: "Too many files; only the first 5000 are shown.",
    sortAsc: "Sort by size ascending", sortDesc: "Sort by size descending",
  } });
}

const MAX_ROWS = 5000;

const extraStyles = `
  .anyfile-torrent-viewer__hash { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 0 14px; margin-bottom:14px; border-bottom:1px solid ${viewerTheme.border}; }
  .anyfile-torrent-viewer__tracker-list { margin:0 0 14px; padding-inline-start:18px; }
  .anyfile-torrent-viewer__tracker-list li { overflow-wrap:anywhere; }
`;

export function createTorrentView(_fileName: string, document: TorrentDocument, locale: Locale) {
  const copy = copyFor(locale);
  const shell = createInspectorShell({
    className: "anyfile-torrent-viewer",
    title: document.name,
    stats: [
      `${document.files.length.toLocaleString(locale)} ${copy.fileCount}`,
      `${copy.totalSize}: ${formatBytes(document.totalSize, locale)}`,
    ],
    layout: "split",
    extraStyles,
  });

  const overviewItems: KeyValueItem[] = [
    { label: copy.name, value: document.name },
    { label: copy.totalSize, value: formatBytes(document.totalSize, locale) },
    { label: copy.fileCount, value: document.files.length.toLocaleString(locale) },
    { label: copy.pieceLength, value: formatBytes(document.pieceLength, locale), hidden: document.pieceLength === undefined },
    { label: copy.pieces, value: document.pieceCount?.toLocaleString(locale) ?? "", hidden: document.pieceCount === undefined },
    { label: copy.private, value: document.isPrivate ? copy.yes : copy.no },
    { label: copy.createdBy, value: document.createdBy ?? "", hidden: !document.createdBy },
    { label: copy.creationDate, value: document.creationDate?.toLocaleString(locale) ?? "", hidden: !document.creationDate },
    { label: copy.comment, value: document.comment ?? "", hidden: !document.comment },
  ];

  const hashRow = el("div", "anyfile-torrent-viewer__hash", el("span", "anyfile-inspector__muted", copy.infoHash));
  if (document.infoHash) {
    const hashValue = document.infoHash;
    const copyBtn = el("button", {
      className: "anyfile-inspector__btn",
      attrs: { type: "button" },
      dataset: { copyHash: hashValue },
    }, copy.copy);
    const onCopy = () => {
      void navigator.clipboard?.writeText(hashValue).then(() => { copyBtn.textContent = copy.copied; }).catch(() => {});
    };
    copyBtn.addEventListener("click", onCopy);
    shell.onDispose(() => copyBtn.removeEventListener("click", onCopy));
    hashRow.append(el("code", "anyfile-inspector__mono", hashValue), copyBtn);
  } else {
    hashRow.append(el("span", "anyfile-inspector__muted", "—"));
  }

  const trackersContent = document.trackers.length === 0
    ? el("p", "anyfile-inspector__muted", copy.noData)
    : el("ul", "anyfile-torrent-viewer__tracker-list", ...document.trackers.map((t) => el("li", undefined, t.url)));

  shell.sidebar!.append(
    createKeyValueList(overviewItems),
    hashRow,
    createSection(copy.trackers, trackersContent, { headingLevel: 3 }),
  );
  if (document.webSeeds.length > 0) {
    shell.sidebar!.append(createSection(
      copy.webSeeds,
      el("ul", "anyfile-torrent-viewer__tracker-list", ...document.webSeeds.map((seed) => el("li", undefined, seed))),
      { headingLevel: 3 },
    ));
  }

  let query = "";
  let sort: SortDirection = "none";
  const table = createDataTable({
    className: "anyfile-torrent-viewer__table",
    columns: [
      { label: copy.path },
      {
        label: copy.size,
        width: "120px",
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
    let visible = query ? document.files.filter((file) => file.path.toLowerCase().includes(query)) : document.files;
    if (sort !== "none") {
      visible = [...visible].sort((a, b) => (sort === "asc" ? a.length - b.length : b.length - a.length));
    }
    const capped = visible.slice(0, MAX_ROWS);
    table.setRows(
      capped.map((file) => [file.path, formatBytes(file.length, locale)]),
      { note: visible.length > MAX_ROWS ? copy.hidden : undefined },
    );
  };

  const filter = createFilterInput({
    placeholder: copy.filter,
    dataset: { torrentFilter: "" },
    onInput: (nextQuery) => {
      query = nextQuery;
      render();
    },
  });
  shell.header.append(filter.input);
  shell.viewport.append(table.element);
  shell.onDispose(() => {
    filter.dispose();
    table.dispose();
  });

  render();
  return { root: shell.root, dispose: () => shell.dispose() };
}
