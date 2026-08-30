import { formatBytes } from "../binary";
import type { ArchiveEntry, ArchiveMetadata } from "../types";
import { archiveViewerStyles } from "./styles";

const PAGE_SIZE = 100;
export const ARCHIVE_VIEWER_BUILD_MARKER = "__anyfile_archive_metadata_viewer_v1__";

type Copy = {
  readonly metadata: string;
  readonly entries: string;
  readonly filter: string;
  readonly previous: string;
  readonly next: string;
  readonly noMatches: string;
  readonly columns: readonly string[];
  readonly dangerous: string;
  readonly encrypted: string;
  readonly suspiciousCompression: string;
  readonly kind: Readonly<Record<ArchiveMetadata["kind"], string>>;
};

function copyFor(locale: string): Copy {
  if (!locale.toLowerCase().startsWith("zh")) {
    return {
      metadata: "Container metadata", entries: "Entries", filter: "Filter by path",
      previous: "Previous", next: "Next", noMatches: "No matching entries.",
      columns: ["Path", "Type", "Original size", "Compressed size", "Modified", "Method"],
      dangerous: "Unsafe path", encrypted: "Encrypted",
      suspiciousCompression: "Suspicious compression ratio",
      kind: { archive: "Archive directory", wrapper: "Compression wrapper", bare: "Raw stream" },
    };
  }
  return {
    metadata: "容器元数据", entries: "条目列表", filter: "按路径过滤",
    previous: "上一页", next: "下一页", noMatches: "没有匹配的条目。",
    columns: ["路径", "类型", "原始大小", "压缩后大小", "修改时间", "方法"],
    dangerous: "危险路径", encrypted: "已加密",
    suspiciousCompression: "异常压缩比",
    kind: { archive: "归档目录", wrapper: "压缩包装层", bare: "裸压缩流" },
  };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  return value;
}

function addText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, value: string, className?: string) {
  const child = element(tag, className);
  child.textContent = value;
  parent.append(child);
  return child;
}

function extraMetadata(entry: ArchiveEntry): string {
  return [
    entry.checksum && `CRC: ${entry.checksum}`,
    entry.permissions && `权限: ${entry.permissions}`,
    entry.linkTarget && `链接: ${entry.linkTarget}`,
    entry.comment && `注释: ${entry.comment}`,
  ].filter(Boolean).join(" · ");
}

function renderRows(body: HTMLTableSectionElement, entries: readonly ArchiveEntry[], copy: Copy) {
  body.replaceChildren();
  for (const entry of entries) {
    const row = element("tr");
    const pathCell = element("td", "anyfile-archive-viewer__path");
    addText(pathCell, "span", entry.path);
    if (entry.dangerousPath) addText(pathCell, "span", copy.dangerous, "anyfile-archive-viewer__badge");
    if (entry.encrypted) addText(pathCell, "span", copy.encrypted, "anyfile-archive-viewer__badge");
    if (entry.suspiciousCompression) addText(pathCell, "span", copy.suspiciousCompression, "anyfile-archive-viewer__badge");
    const extra = extraMetadata(entry);
    if (extra) addText(pathCell, "span", extra, "anyfile-archive-viewer__entry-meta");
    row.append(pathCell);
    for (const value of [
      entry.type,
      entry.size === undefined ? "—" : formatBytes(entry.size),
      entry.compressedSize === undefined ? "—" : formatBytes(entry.compressedSize),
      entry.modified && !Number.isNaN(entry.modified.getTime()) ? entry.modified.toLocaleString() : "—",
      entry.method ?? "—",
    ]) addText(row, "td", value);
    body.append(row);
  }
}

export function createArchiveView(fileName: string, metadata: ArchiveMetadata, locale: string) {
  const copy = copyFor(locale);
  const root = element("div", "anyfile-archive-viewer");
  root.dataset.archiveViewerBuild = ARCHIVE_VIEWER_BUILD_MARKER;
  const style = element("style");
  style.textContent = archiveViewerStyles;
  const header = element("header", "anyfile-archive-viewer__header");
  const title = element("div", "anyfile-archive-viewer__title");
  const name = addText(title, "strong", fileName);
  name.title = fileName;
  addText(title, "span", `${metadata.format} · ${metadata.detectedBy}`);
  addText(header, "span", copy.kind[metadata.kind], "anyfile-archive-viewer__kind");
  header.prepend(title);

  const metadataSection = element("section", "anyfile-archive-viewer__section");
  addText(metadataSection, "h2", copy.metadata);
  const fields = element("dl", "anyfile-archive-viewer__fields");
  for (const field of metadata.fields) {
    const item = element("div", "anyfile-archive-viewer__field");
    addText(item, "dt", field.label);
    addText(item, "dd", field.value);
    fields.append(item);
  }
  metadataSection.append(fields);
  root.append(style, header, metadataSection);
  if (metadata.limitation) addText(root, "p", metadata.limitation, "anyfile-archive-viewer__notice");

  if (metadata.entries) {
    const section = element("section", "anyfile-archive-viewer__section");
    addText(section, "h2", copy.entries);
    const controls = element("div", "anyfile-archive-viewer__controls");
    const filter = element("input");
    filter.type = "search";
    filter.placeholder = copy.filter;
    filter.setAttribute("aria-label", copy.filter);
    filter.dataset.archiveFilter = "";
    const previous = element("button");
    previous.type = "button";
    previous.textContent = copy.previous;
    previous.dataset.previous = "";
    const next = element("button");
    next.type = "button";
    next.textContent = copy.next;
    next.dataset.next = "";
    const pageMeta = addText(controls, "span", "", "anyfile-archive-viewer__muted");
    pageMeta.dataset.meta = "";
    controls.prepend(filter, previous, next);
    const table = element("table", "anyfile-archive-viewer__table");
    const head = element("thead");
    const headRow = element("tr");
    for (const column of copy.columns) {
      const headerCell = addText(headRow, "th", column) as HTMLTableCellElement;
      headerCell.scope = "col";
    }
    head.append(headRow);
    const body = element("tbody");
    table.append(head, body);
    const empty = addText(section, "p", copy.noMatches, "anyfile-archive-viewer__empty");
    let filtered = metadata.entries;
    let pageIndex = 0;
    const render = () => {
      const start = pageIndex * PAGE_SIZE;
      const page = filtered.slice(start, start + PAGE_SIZE);
      renderRows(body, page, copy);
      table.hidden = page.length === 0;
      empty.hidden = page.length !== 0;
      previous.disabled = pageIndex === 0;
      next.disabled = start + PAGE_SIZE >= filtered.length;
      pageMeta.textContent = filtered.length === 0 ? "0" : `${start + 1}–${start + page.length} / ${filtered.length}`;
    };
    const onFilter = () => {
      const query = filter.value.toLocaleLowerCase();
      filtered = query ? metadata.entries!.filter((entry) => entry.path.toLocaleLowerCase().includes(query)) : metadata.entries!;
      pageIndex = 0;
      render();
    };
    const onPrevious = () => { pageIndex -= 1; render(); };
    const onNext = () => { pageIndex += 1; render(); };
    filter.addEventListener("input", onFilter);
    previous.addEventListener("click", onPrevious);
    next.addEventListener("click", onNext);
    section.append(controls, table, empty);
    root.append(section);
    render();
    return {
      root,
      dispose() {
        filter.removeEventListener("input", onFilter);
        previous.removeEventListener("click", onPrevious);
        next.removeEventListener("click", onNext);
        root.remove();
      },
    };
  }

  return { root, dispose() { root.remove(); } };
}
