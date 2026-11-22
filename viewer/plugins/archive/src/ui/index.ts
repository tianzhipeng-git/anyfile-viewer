import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createBadge,
  createDataTable,
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createNotice,
  createPager,
  createSection,
  el,
  viewerTheme,
} from "@anyfile/viewer-ui";

import { formatBytes } from "../binary";
import type { ArchiveEntry, ArchiveMetadata } from "../types";

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

const extraStyles = `
  .anyfile-archive-viewer__controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:10px; }
  .anyfile-archive-viewer__path { max-width:420px; overflow-wrap:anywhere; }
  .anyfile-archive-viewer__flags { display:inline-flex; flex-wrap:wrap; gap:4px; margin-inline-start:6px; vertical-align:middle; }
  .anyfile-archive-viewer__entry-meta { display:block; margin-top:3px; color:${viewerTheme.muted}; font-size:11px; }
  .anyfile-archive-viewer__table { min-width:760px; }
`;

function buildPathCell(entry: ArchiveEntry, copy: Copy): HTMLDivElement {
  const cell = el("div", "anyfile-archive-viewer__path", el("span", undefined, entry.path));
  const flags: HTMLSpanElement[] = [];
  if (entry.dangerousPath) flags.push(createBadge(copy.dangerous, "danger"));
  if (entry.encrypted) flags.push(createBadge(copy.encrypted, "warning"));
  if (entry.suspiciousCompression) flags.push(createBadge(copy.suspiciousCompression, "danger"));
  if (flags.length > 0) cell.append(el("span", "anyfile-archive-viewer__flags", ...flags));
  const extra = extraMetadata(entry, copy);
  if (extra) cell.append(el("span", "anyfile-archive-viewer__entry-meta", extra));
  return cell;
}

export function createArchiveView(fileName: string, metadata: ArchiveMetadata, locale: Locale) {
  const copy = copyFor(locale);
  const archiveText = selectMessages<ArchiveText>(locale, {
    en: englishArchiveText,
    "zh-CN": (value, fallback) => value ?? fallback,
  });

  const shell = createInspectorShell({
    className: "anyfile-archive-viewer",
    title: fileName,
    subtitle: `${metadata.format} · ${archiveText(metadata.detectedBy, "Identified from the file signature and extension")}`,
    badges: [{ text: copy.kind[metadata.kind], tone: "accent" }],
    extraStyles,
  });
  shell.root.dataset.archiveViewerBuild = ARCHIVE_VIEWER_BUILD_MARKER;

  shell.viewport.append(createSection(
    copy.metadata,
    createKeyValueList(
      metadata.fields.map((field) => ({
        label: archiveText(field.label, "Metadata"),
        value: archiveText(field.value, "Available"),
      })),
      { variant: "cards" },
    ),
  ));

  if (metadata.limitation) {
    shell.viewport.append(createNotice(
      archiveText(metadata.limitation, "Some archive metadata cannot be displayed."),
      "warning",
    ));
  }

  if (metadata.entries) {
    const allEntries = metadata.entries;
    let filtered: readonly ArchiveEntry[] = allEntries;
    let pageIndex = 0;

    const table = createDataTable({
      className: "anyfile-archive-viewer__table",
      columns: copy.columns.map((label, index) => ({
        label,
        align: index === 2 || index === 3 ? "end" : "start",
        mono: index === 2 || index === 3,
        nowrap: index !== 0,
      })),
      bordered: true,
      stickyHeader: false,
    });
    const empty = el("p", "anyfile-inspector__empty", copy.noMatches);

    const pager = createPager({
      previousLabel: copy.previous,
      nextLabel: copy.next,
      onPageChange: (nextPage) => {
        pageIndex = nextPage;
        render();
      },
    });

    const render = () => {
      const start = pageIndex * PAGE_SIZE;
      const page = filtered.slice(start, start + PAGE_SIZE);
      table.setRows(page.map((entry) => [
        buildPathCell(entry, copy),
        archiveText(entry.type, "Entry"),
        entry.size === undefined ? "—" : formatBytes(entry.size),
        entry.compressedSize === undefined ? "—" : formatBytes(entry.compressedSize),
        entry.modified && !Number.isNaN(entry.modified.getTime()) ? entry.modified.toLocaleString(locale) : "—",
        archiveText(entry.method, "Other"),
      ]));
      table.table.hidden = page.length === 0;
      empty.hidden = page.length !== 0;
      pager.update({ page: pageIndex, pageSize: PAGE_SIZE, total: filtered.length });
    };

    const filter = createFilterInput({
      placeholder: copy.filter,
      dataset: { archiveFilter: "" },
      onInput: (query) => {
        filtered = query ? allEntries.filter((entry) => entry.path.toLocaleLowerCase().includes(query)) : allEntries;
        pageIndex = 0;
        render();
      },
    });

    const controls = el("div", "anyfile-archive-viewer__controls", filter.input, pager.element);
    shell.viewport.append(createSection(copy.entries, [controls, table.element, empty]));
    shell.onDispose(() => {
      filter.dispose();
      pager.dispose();
      table.dispose();
    });
    render();
  }

  return { root: shell.root, dispose: () => shell.dispose() };
}
