import type { Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createInspectorShell,
  createKeyValueList,
  createNotice,
  createPager,
  el,
  formatBytes,
  viewerTheme,
} from "@anyfile/viewer-ui";

import type { PstCopy } from "./copy";
import { renderMessage } from "./message-view";
import type { FolderInfo, MessageList, MessageSummary, PstArchive } from "./messaging";

const PAGE_SIZE = 50;

const extraStyles = `
  .anyfile-pst .anyfile-inspector__sidebar { padding: 8px 4px; }
  .anyfile-pst__tree, .anyfile-pst__tree ul { list-style: none; margin: 0; padding: 0; }
  .anyfile-pst__tree ul { padding-inline-start: 14px; }
  .anyfile-pst__folder { display: flex; align-items: center; gap: 2px; }
  .anyfile-pst__toggle { width: 18px; flex: none; border: 0; background: none; color: ${viewerTheme.muted}; cursor: pointer; padding: 0; font: inherit; }
  .anyfile-pst__name { flex: 1; min-width: 0; display: flex; justify-content: space-between; gap: 6px; border: 0; background: none; color: inherit;
    font: inherit; text-align: start; padding: 3px 6px; border-radius: 4px; cursor: pointer; }
  .anyfile-pst__name span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .anyfile-pst__name:hover { background: ${viewerTheme.surface}; }
  .anyfile-pst__name[aria-current="true"] { background: ${viewerTheme.accent}; color: ${viewerTheme.accentForeground}; }
  .anyfile-pst__count { color: inherit; opacity: .7; font-variant-numeric: tabular-nums; }
  .anyfile-pst__list { max-height: 45vh; overflow: auto; }
  .anyfile-pst__message { border-top: 1px solid ${viewerTheme.border}; margin-top: 12px; padding-top: 8px; }
  .anyfile-pst__subject { font-size: 18px; margin: 4px 0 8px; overflow-wrap: anywhere; }
  .anyfile-pst__attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .anyfile-pst__body { margin-top: 8px; }
  .anyfile-pst__frame { width: 100%; min-height: 160px; height: 480px; border: 1px solid ${viewerTheme.border}; border-radius: 6px; background: #fff; }
  .anyfile-pst__text { white-space: pre-wrap; overflow-wrap: anywhere; font-family: ${viewerTheme.fontMono}; font-size: 12.5px; margin: 0; }
`;

function folderLabel(folder: FolderInfo) {
  return folder.name || "—";
}

/** `initialPath` lists folder nids from a top-level folder down to the folder selected on open. */
export function createPstView(
  fileName: string,
  archive: PstArchive,
  topFolders: readonly FolderInfo[],
  initialPath: readonly number[],
  copy: PstCopy,
  locale: Locale,
) {
  const { header } = archive.ndb;
  const shell = createInspectorShell({
    className: "anyfile-pst",
    title: fileName,
    subtitle: archive.storeName || (header.isOst ? copy.ost : copy.pst),
    badges: [
      { text: header.isOst ? "OST" : "PST", tone: "accent" },
      { text: copy[header.format] },
      ...(archive.passwordProtected && !header.isOst ? [{ text: copy.password, tone: "warning" as const }] : []),
    ],
    layout: "split",
    extraStyles,
  });
  let disposed = false;
  let listToken = 0;
  let messageToken = 0;
  let disposeMessage: (() => void) | undefined;
  shell.onDispose(() => {
    disposed = true;
    disposeMessage?.();
  });

  const listHost = el("div", "anyfile-pst__list");
  const messageHost = el("div", "anyfile-pst__message", el("p", "anyfile-inspector__muted", copy.selectMessage));
  messageHost.hidden = true;
  const table = createDataTable({
    columns: [
      { label: copy.subject },
      { label: copy.from, width: "22%" },
      { label: copy.date, width: "18%", nowrap: true },
      { label: copy.size, width: "9%", align: "end", nowrap: true },
    ],
    ariaLabel: copy.subject,
    emptyMessage: copy.emptyFolder,
  });
  shell.onDispose(() => table.dispose());
  let list: MessageList | undefined;
  let rows: MessageSummary[] = [];
  let page = 0;
  const pager = createPager({ previousLabel: copy.previous, nextLabel: copy.next, onPageChange: (next) => void showPage(next) });
  shell.onDispose(() => pager.dispose());
  listHost.append(el("p", "anyfile-inspector__muted", copy.selectFolder));

  const fail = (host: HTMLElement) => {
    if (!disposed) host.replaceChildren(createNotice(copy.itemError, "warning"));
  };

  async function showPage(next: number) {
    if (!list) return;
    const token = ++listToken;
    try {
      rows = await list.page(next * PAGE_SIZE, PAGE_SIZE);
    } catch {
      if (token === listToken) fail(listHost);
      return;
    }
    if (disposed || token !== listToken) return;
    page = next;
    table.setRows(rows.map((message, index) => ({
      cells: [
        `${message.hasAttachments ? "📎 " : ""}${message.subject || copy.noSubject}`,
        message.from,
        message.date ? message.date.toLocaleString(locale) : "",
        message.size === null ? "" : formatBytes(message.size, locale),
      ],
      interactive: true,
      dataset: { pstRow: String(index) },
    })));
    pager.update({ page, pageSize: PAGE_SIZE, total: list.count });
    listHost.replaceChildren(table.element);
    if (list.count > PAGE_SIZE) listHost.append(pager.element);
  }

  async function selectFolder(folder: FolderInfo, button: HTMLButtonElement) {
    for (const current of shell.sidebar!.querySelectorAll("[aria-current]")) current.removeAttribute("aria-current");
    button.setAttribute("aria-current", "true");
    disposeMessage?.();
    disposeMessage = undefined;
    messageToken++;
    messageHost.hidden = true;
    const token = ++listToken;
    listHost.replaceChildren(el("p", "anyfile-inspector__muted", copy.loading));
    try {
      const next = await archive.contents(folder.nid);
      if (disposed || token !== listToken) return;
      list = next;
      shell.setStats([`${folderLabel(folder)} · ${next.count.toLocaleString(locale)} ${copy.messages}`]);
      await showPage(0);
    } catch {
      if (token === listToken) fail(listHost);
    }
  }

  async function openMessage(summary: MessageSummary, row: HTMLElement) {
    for (const current of table.tbody.querySelectorAll(".anyfile-inspector__row--selected")) current.classList.remove("anyfile-inspector__row--selected");
    row.classList.add("anyfile-inspector__row--selected");
    disposeMessage?.();
    disposeMessage = undefined;
    const token = ++messageToken;
    const isCurrent = () => !disposed && token === messageToken;
    messageHost.hidden = false;
    messageHost.replaceChildren(el("p", "anyfile-inspector__muted", copy.loading));
    try {
      const detail = await archive.message(summary.nid);
      if (!isCurrent()) return;
      const dispose = await renderMessage(messageHost, archive, detail, copy, locale, isCurrent);
      if (isCurrent()) disposeMessage = dispose;
      else dispose();
    } catch {
      if (isCurrent()) fail(messageHost);
    }
  }

  const onRowClick = (event: Event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-pst-row]");
    const summary = row ? rows[Number(row.dataset.pstRow)] : undefined;
    if (row && summary) void openMessage(summary, row);
  };
  table.tbody.addEventListener("click", onRowClick);
  shell.onDispose(() => table.tbody.removeEventListener("click", onRowClick));

  function folderItem(folder: FolderInfo, depth: number): HTMLLIElement {
    const item = el("li");
    const toggle = el("button", { className: "anyfile-pst__toggle", attrs: { type: "button", "aria-expanded": "false" } }, folder.hasSubfolders ? "▸" : "");
    toggle.disabled = !folder.hasSubfolders;
    const name = el("button", { className: "anyfile-pst__name", attrs: { type: "button" }, dataset: { pstFolder: String(folder.nid) }, title: folderLabel(folder) },
      el("span", undefined, folderLabel(folder)),
      folder.contentCount > 0 ? el("span", "anyfile-pst__count", folder.contentCount.toLocaleString(locale)) : null);
    item.append(el("div", "anyfile-pst__folder", toggle, name));
    let children: HTMLUListElement | undefined;
    const expand = async () => {
      if (children) {
        children.hidden = !children.hidden;
      } else {
        children = el("ul");
        item.append(children);
        try {
          const subfolders = await archive.subfolders(folder.nid);
          if (disposed) return;
          children.append(...subfolders.map((child) => folderItem(child, depth + 1)));
        } catch {
          fail(children);
        }
      }
      toggle.textContent = children.hidden ? "▸" : "▾";
      toggle.setAttribute("aria-expanded", String(!children.hidden));
    };
    toggle.addEventListener("click", () => void expand());
    name.addEventListener("click", () => void selectFolder(folder, name));
    const onPath = initialPath.indexOf(folder.nid);
    if (onPath >= 0 && onPath === initialPath.length - 1) void selectFolder(folder, name);
    else if (folder.hasSubfolders && (depth === 0 || onPath >= 0)) void expand();
    return item;
  }

  const tree = el("ul", { className: "anyfile-pst__tree", role: "tree" }, ...topFolders.map((folder) => folderItem(folder, 0)));
  shell.sidebar!.append(
    el("h2", "anyfile-inspector__heading", copy.folders),
    tree,
    createKeyValueList([
      { label: copy.store, value: archive.storeName, hidden: !archive.storeName },
      { label: copy.format, value: `${header.isOst ? copy.ost : copy.pst} · ${copy[header.format]}` },
      { label: copy.encryption, value: header.cryptMethod === 1 ? copy.compressible : copy.none },
    ]),
  );
  shell.setStats([`${topFolders.length.toLocaleString(locale)} ${copy.folderCount}`]);
  shell.viewport.append(listHost, messageHost);
  return { root: shell.root, dispose: () => shell.dispose() };
}
