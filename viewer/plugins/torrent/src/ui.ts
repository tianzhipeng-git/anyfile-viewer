import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { TorrentDocument } from "./types";



function copyFor(locale: Locale) {
  return selectMessages(locale, { "zh-CN": {
    overview: "概览", files: "文件", trackers: "Tracker", webSeeds: "Web 种子",
    name: "名称", totalSize: "总大小", fileCount: "文件数", infoHash: "InfoHash", pieceLength: "分块大小",
    pieces: "分块数", private: "私有种子", createdBy: "创建工具", creationDate: "创建时间", comment: "备注",
    yes: "是", no: "否", noData: "无", path: "路径", size: "大小", copy: "复制", copied: "已复制",
    filter: "筛选文件路径", empty: "没有匹配的文件", hidden: "文件过多，仅显示前 5000 个。", filesTab: "文件",
    metadataTab: "元数据", sortAsc: "按大小升序排列", sortDesc: "按大小降序排列",
  }, en: {
    overview: "Overview", files: "Files", trackers: "Trackers", webSeeds: "Web seeds",
    name: "Name", totalSize: "Total size", fileCount: "Files", infoHash: "InfoHash", pieceLength: "Piece length",
    pieces: "Pieces", private: "Private torrent", createdBy: "Created by", creationDate: "Created", comment: "Comment",
    yes: "Yes", no: "No", noData: "None", path: "Path", size: "Size", copy: "Copy", copied: "Copied",
    filter: "Filter file paths", empty: "No matching files", hidden: "Too many files; only the first 5000 are shown.", filesTab: "Files",
    metadataTab: "Metadata", sortAsc: "Sort by size ascending", sortDesc: "Sort by size descending",
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
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toLocaleString(locale, { maximumFractionDigits: 2 })} ${units[unit]}`;
}

const MAX_ROWS = 5000;

export function createTorrentView(fileName: string, document: TorrentDocument, locale: Locale) {
  const copy = copyFor(locale);
  const root = node("div", "anyfile-torrent-viewer");
  const toolbar = node("div", "anyfile-torrent-viewer__toolbar");
  const title = node("div", "anyfile-torrent-viewer__title", document.name);
  title.title = document.name;
  const stats = [
    `${document.files.length.toLocaleString(locale)} ${copy.fileCount}`,
    `${copy.totalSize}: ${formatBytes(document.totalSize, locale)}`,
  ].map((text) => node("span", "anyfile-torrent-viewer__stat", text));
  const filter = node("input", "anyfile-torrent-viewer__filter") as HTMLInputElement;
  filter.type = "search";
  filter.placeholder = copy.filter;
  filter.setAttribute("aria-label", copy.filter);
  filter.dataset.torrentFilter = "";
  toolbar.append(title, ...stats, filter);

  const body = node("div", "anyfile-torrent-viewer__body");

  const metadata = node("section", "anyfile-torrent-viewer__metadata");
  const overview = node("dl", "anyfile-torrent-viewer__overview");
  const rows: [string, string][] = [
    [copy.name, document.name],
    [copy.totalSize, formatBytes(document.totalSize, locale)],
    [copy.fileCount, document.files.length.toLocaleString(locale)],
  ];
  if (document.pieceLength !== undefined) rows.push([copy.pieceLength, formatBytes(document.pieceLength, locale)]);
  if (document.pieceCount !== undefined) rows.push([copy.pieces, document.pieceCount.toLocaleString(locale)]);
  rows.push([copy.private, document.isPrivate ? copy.yes : copy.no]);
  if (document.createdBy) rows.push([copy.createdBy, document.createdBy]);
  if (document.creationDate) rows.push([copy.creationDate, document.creationDate.toLocaleString(locale)]);
  if (document.comment) rows.push([copy.comment, document.comment]);
  for (const [label, value] of rows) overview.append(node("dt", undefined, label), node("dd", undefined, value));

  const hashRow = node("div", "anyfile-torrent-viewer__hash");
  hashRow.append(node("span", "anyfile-torrent-viewer__hash-label", copy.infoHash));
  if (document.infoHash) {
    const code = node("code", "anyfile-torrent-viewer__hash-value", document.infoHash);
    const button = node("button", "anyfile-torrent-viewer__copy", copy.copy) as HTMLButtonElement;
    button.type = "button";
    button.dataset.copyHash = document.infoHash;
    button.addEventListener("click", () => {
      void navigator.clipboard?.writeText(document.infoHash!).then(() => { button.textContent = copy.copied; }).catch(() => {});
    });
    hashRow.append(code, button);
  } else {
    hashRow.append(node("span", "anyfile-torrent-viewer__muted", "—"));
  }
  metadata.append(overview, hashRow);

  const trackerSection = node("section", "anyfile-torrent-viewer__trackers");
  trackerSection.append(node("h3", undefined, copy.trackers));
  if (document.trackers.length === 0) {
    trackerSection.append(node("p", "anyfile-torrent-viewer__muted", copy.noData));
  } else {
    const list = node("ul", "anyfile-torrent-viewer__tracker-list");
    for (const tracker of document.trackers) list.append(node("li", undefined, tracker.url));
    trackerSection.append(list);
  }
  if (document.webSeeds.length > 0) {
    trackerSection.append(node("h3", undefined, copy.webSeeds));
    const seeds = node("ul", "anyfile-torrent-viewer__tracker-list");
    for (const seed of document.webSeeds) seeds.append(node("li", undefined, seed));
    trackerSection.append(seeds);
  }
  metadata.append(trackerSection);

  const filesPanel = node("section", "anyfile-torrent-viewer__files");
  const table = node("table", "anyfile-torrent-viewer__table");
  const head = node("thead");
  const header = node("tr");
  const pathHead = node("th", undefined, copy.path);
  const sizeHead = node("th", "anyfile-torrent-viewer__size-head", copy.size) as HTMLTableCellElement;
  sizeHead.dataset.sort = "none";
  header.append(pathHead, sizeHead);
  head.append(header);
  const tbody = node("tbody");
  table.append(head, tbody);
  filesPanel.append(table);

  body.append(metadata, filesPanel);
  root.append(styles(), toolbar, body);

  let sort: "none" | "asc" | "desc" = "none";
  const render = () => {
    const query = filter.value.trim().toLowerCase();
    let visible = query ? document.files.filter((file) => file.path.toLowerCase().includes(query)) : document.files;
    if (sort !== "none") {
      visible = [...visible].sort((a, b) => sort === "asc" ? a.length - b.length : b.length - a.length);
    }
    const capped = visible.slice(0, MAX_ROWS);
    tbody.replaceChildren(...capped.map((file) => {
      const row = node("tr");
      row.append(node("td", "anyfile-torrent-viewer__path", file.path), node("td", "anyfile-torrent-viewer__size", formatBytes(file.length, locale)));
      return row;
    }));
    if (visible.length === 0) {
      const empty = node("tr");
      const cell = node("td", "anyfile-torrent-viewer__empty", copy.empty);
      cell.colSpan = 2;
      empty.append(cell);
      tbody.append(empty);
    } else if (visible.length > MAX_ROWS) {
      const noteRow = node("tr");
      const cell = node("td", "anyfile-torrent-viewer__note", copy.hidden);
      cell.colSpan = 2;
      noteRow.append(cell);
      tbody.append(noteRow);
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
    .anyfile-torrent-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font:13px/1.45 var(--viewer-font-family,system-ui); }
    .anyfile-torrent-viewer__toolbar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; padding:12px 16px; border-bottom:1px solid var(--viewer-border,#ddd); }
    .anyfile-torrent-viewer__title { min-width:160px; max-width:360px; overflow:hidden; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-torrent-viewer__stat { color:color-mix(in srgb,var(--viewer-foreground,#111) 62%,transparent); white-space:nowrap; }
    .anyfile-torrent-viewer__filter { box-sizing:border-box; min-width:200px; flex:1; padding:7px 10px; border:1px solid var(--viewer-border,#ddd); border-radius:6px; background:var(--viewer-background,#fff); color:inherit; }
    .anyfile-torrent-viewer__body { min-height:0; flex:1; display:grid; grid-template-columns:minmax(320px,0.85fr) minmax(360px,1.15fr); overflow:hidden; }
    .anyfile-torrent-viewer__metadata { min-height:0; padding:14px 18px; overflow:auto; border-inline-end:1px solid var(--viewer-border,#ddd); }
    .anyfile-torrent-viewer__overview { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:6px 14px; margin:0 0 14px; }
    .anyfile-torrent-viewer__overview dt { color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); }
    .anyfile-torrent-viewer__overview dd { min-width:0; margin:0; overflow-wrap:anywhere; }
    .anyfile-torrent-viewer__hash { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 0 14px; border-bottom:1px solid var(--viewer-border,#ddd); }
    .anyfile-torrent-viewer__hash-label { color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); }
    .anyfile-torrent-viewer__hash-value { overflow-wrap:anywhere; font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .anyfile-torrent-viewer__copy { padding:3px 9px; border:1px solid var(--viewer-border,#ddd); border-radius:6px; background:var(--viewer-background,#fff); color:inherit; cursor:pointer; }
    .anyfile-torrent-viewer__trackers { padding-top:14px; }
    .anyfile-torrent-viewer__trackers h3 { margin:0 0 8px; font-size:13px; }
    .anyfile-torrent-viewer__tracker-list { margin:0 0 14px; padding-inline-start:18px; } .anyfile-torrent-viewer__tracker-list li { overflow-wrap:anywhere; }
    .anyfile-torrent-viewer__files { min-height:0; overflow:auto; }
    .anyfile-torrent-viewer__table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .anyfile-torrent-viewer__table th { position:sticky; top:0; z-index:1; padding:8px 12px; border-bottom:1px solid var(--viewer-border,#ddd); background:color-mix(in srgb,var(--viewer-background,#fff) 94%,var(--viewer-foreground,#111)); text-align:start; }
    .anyfile-torrent-viewer__table td { padding:7px 12px; border-bottom:1px solid color-mix(in srgb,var(--viewer-border,#ddd) 72%,transparent); vertical-align:top; }
    .anyfile-torrent-viewer__size-head { width:120px; cursor:pointer; user-select:none; }
    .anyfile-torrent-viewer__size-head[data-sort='asc']::after { content:" ▲"; } .anyfile-torrent-viewer__size-head[data-sort='desc']::after { content:" ▼"; }
    .anyfile-torrent-viewer__path { overflow-wrap:anywhere; } .anyfile-torrent-viewer__size { font-variant-numeric:tabular-nums; white-space:nowrap; text-align:end; }
    .anyfile-torrent-viewer__muted, .anyfile-torrent-viewer__note, .anyfile-torrent-viewer__empty { color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); } .anyfile-torrent-viewer__note { padding:10px 12px; font-size:12px; } .anyfile-torrent-viewer__empty { padding:36px 12px; text-align:center; }
  `;
  return style;
}
