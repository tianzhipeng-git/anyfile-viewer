import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

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
  readonly permissions: string;
  readonly link: string;
  readonly comment: string;
};

function copyFor(locale: Locale): Copy {
  return selectMessages(locale, {
    en: {
      metadata: "Container metadata", entries: "Entries", filter: "Filter by path",
      previous: "Previous", next: "Next", noMatches: "No matching entries.",
      columns: ["Path", "Type", "Original size", "Compressed size", "Modified", "Method"],
      dangerous: "Unsafe path", encrypted: "Encrypted",
      suspiciousCompression: "Suspicious compression ratio",
      kind: { archive: "Archive directory", wrapper: "Compression wrapper", bare: "Raw stream" },
      permissions: "Permissions", link: "Link", comment: "Comment",
    },
    "zh-CN": {
    metadata: "容器元数据", entries: "条目列表", filter: "按路径过滤",
    previous: "上一页", next: "下一页", noMatches: "没有匹配的条目。",
    columns: ["路径", "类型", "原始大小", "压缩后大小", "修改时间", "方法"],
    dangerous: "危险路径", encrypted: "已加密",
    suspiciousCompression: "异常压缩比",
    kind: { archive: "归档目录", wrapper: "压缩包装层", bare: "裸压缩流" },
    permissions: "权限", link: "链接", comment: "注释",
    },
  });
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

function extraMetadata(entry: ArchiveEntry, copy: Copy): string {
  return [
    entry.checksum && `CRC: ${entry.checksum}`,
    entry.permissions && `${copy.permissions}: ${entry.permissions}`,
    entry.linkTarget && `${copy.link}: ${entry.linkTarget}`,
    entry.comment && `${copy.comment}: ${entry.comment}`,
  ].filter(Boolean).join(" · ");
}

function englishArchiveText(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const exact: Record<string, string> = {
    "文件": "File", "目录": "Directory", "符号链接": "Symbolic link", "硬链接": "Hard link",
    "存储": "Stored", "普通": "Normal", "是": "Yes", "否": "No", "有": "Yes", "无": "None",
  };
  return exact[value] ?? (/\p{Script=Han}/u.test(value) ? fallback : value);
}

type ArchiveText = (value: string | undefined, fallback: string) => string;

function renderRows(body: HTMLTableSectionElement, entries: readonly ArchiveEntry[], copy: Copy, locale: Locale, archiveText: ArchiveText) {
  body.replaceChildren();
  for (const entry of entries) {
    const row = element("tr");
    const pathCell = element("td", "anyfile-archive-viewer__path");
    addText(pathCell, "span", entry.path);
    if (entry.dangerousPath) addText(pathCell, "span", copy.dangerous, "anyfile-archive-viewer__badge");
    if (entry.encrypted) addText(pathCell, "span", copy.encrypted, "anyfile-archive-viewer__badge");
    if (entry.suspiciousCompression) addText(pathCell, "span", copy.suspiciousCompression, "anyfile-archive-viewer__badge");
    const extra = extraMetadata(entry, copy);
    if (extra) addText(pathCell, "span", extra, "anyfile-archive-viewer__entry-meta");
    row.append(pathCell);
    for (const value of [
      archiveText(entry.type, "Entry"),
      entry.size === undefined ? "—" : formatBytes(entry.size),
      entry.compressedSize === undefined ? "—" : formatBytes(entry.compressedSize),
      entry.modified && !Number.isNaN(entry.modified.getTime()) ? entry.modified.toLocaleString(locale) : "—",
      archiveText(entry.method, "Other"),
    ]) addText(row, "td", value);
    body.append(row);
  }
}

export function createArchiveView(fileName: string, metadata: ArchiveMetadata, locale: Locale) {
  const copy = copyFor(locale);
  const archiveText = selectMessages<ArchiveText>(locale, {
    en: englishArchiveText,
    "zh-CN": (value, fallback) => value ?? fallback,
  });
  const root = element("div", "anyfile-archive-viewer");
  root.dataset.archiveViewerBuild = ARCHIVE_VIEWER_BUILD_MARKER;
  const style = element("style");
  style.textContent = archiveViewerStyles;
  const header = element("header", "anyfile-archive-viewer__header");
  const title = element("div", "anyfile-archive-viewer__title");
  const name = addText(title, "strong", fileName);
  name.title = fileName;
  addText(title, "span", `${metadata.format} · ${archiveText(metadata.detectedBy, "Identified from the file signature and extension")}`);
  addText(header, "span", copy.kind[metadata.kind], "anyfile-archive-viewer__kind");
  header.prepend(title);

  const metadataSection = element("section", "anyfile-archive-viewer__section");
  addText(metadataSection, "h2", copy.metadata);
  const fields = element("dl", "anyfile-archive-viewer__fields");
  for (const field of metadata.fields) {
    const item = element("div", "anyfile-archive-viewer__field");
    addText(item, "dt", archiveText(field.label, "Metadata"));
    addText(item, "dd", archiveText(field.value, "Available"));
    fields.append(item);
  }
  metadataSection.append(fields);
  root.append(style, header, metadataSection);
  if (metadata.limitation) addText(root, "p", archiveText(metadata.limitation, "Some archive metadata cannot be displayed."), "anyfile-archive-viewer__notice");

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
      renderRows(body, page, copy, locale, archiveText);
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
