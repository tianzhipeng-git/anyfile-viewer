import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createPager,
  createSection,
  el,
  formatBytes,
  viewerTheme,
} from "@anyfile/viewer-ui";

import type { HarDocument, HarEntry, HarNameValue } from "./types";

const PAGE_SIZE = 100;
const PREVIEW_LIMIT = 32 * 1024;

type Copy = ReturnType<typeof copyFor>;

function copyFor(locale: Locale) {
  return selectMessages(locale, { "zh-CN": {
    requests: "请求", pages: "页面", totalTime: "总耗时", transferred: "传输大小",
    filter: "筛选方法、状态、URL 或类型", previous: "上一页", next: "下一页", empty: "没有匹配的请求",
    overview: "概览", requestHeaders: "请求头", responseHeaders: "响应头", query: "查询参数",
    requestBody: "请求正文", responseBody: "响应正文", timings: "耗时明细", noData: "无",
    method: "方法", url: "URL", status: "状态", type: "类型", duration: "耗时", size: "大小",
    started: "开始时间", protocol: "协议", server: "服务器地址", connection: "连接", redirect: "重定向",
    encoded: "正文使用 Base64 编码；以下为原始编码文本。", truncated: "预览已截断。",
  }, en: {
    requests: "Requests", pages: "Pages", totalTime: "Total time", transferred: "Transferred",
    filter: "Filter method, status, URL, or type", previous: "Previous", next: "Next", empty: "No matching requests",
    overview: "Overview", requestHeaders: "Request headers", responseHeaders: "Response headers", query: "Query parameters",
    requestBody: "Request body", responseBody: "Response body", timings: "Timing details", noData: "None",
    method: "Method", url: "URL", status: "Status", type: "Type", duration: "Time", size: "Size",
    started: "Started", protocol: "Protocol", server: "Server address", connection: "Connection", redirect: "Redirect",
    encoded: "The body is Base64-encoded; raw encoded text is shown below.", truncated: "Preview truncated.",
  } });
}

function formatTime(value: number, locale: string) {
  return value < 1000
    ? `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} ms`
    : `${(value / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} s`;
}

function transferred(entry: HarEntry) {
  const explicit = entry.response.bodySize;
  return explicit !== undefined && explicit >= 0 ? explicit : Math.max(entry.response.content.size ?? 0, 0);
}

function pairsSection(title: string, pairs: readonly HarNameValue[], copy: Copy) {
  const content = pairs.length === 0
    ? el("p", "anyfile-inspector__muted", copy.noData)
    : createKeyValueList(pairs.map((pair) => ({ label: pair.name, value: pair.value })));
  return createSection(title, content, { headingLevel: 3, className: "anyfile-har-viewer__section" });
}

function previewSection(title: string, text: string | undefined, encoded: boolean, copy: Copy) {
  if (!text) return createSection(title, el("p", "anyfile-inspector__muted", copy.noData), { headingLevel: 3, className: "anyfile-har-viewer__section" });
  const preview = text.slice(0, PREVIEW_LIMIT);
  return createSection(title, [
    encoded ? el("p", "anyfile-inspector__note", copy.encoded) : null,
    el("pre", "anyfile-inspector__code", preview),
    preview.length < text.length ? el("p", "anyfile-inspector__note", copy.truncated) : null,
  ], { headingLevel: 3, className: "anyfile-har-viewer__section" });
}

function overview(entry: HarEntry, locale: string, copy: Copy) {
  return createSection(copy.overview, createKeyValueList([
    { label: copy.method, value: entry.request.method },
    { label: copy.status, value: `${entry.response.status} ${entry.response.statusText ?? ""}`.trim() },
    { label: copy.url, value: entry.request.url },
    { label: copy.type, value: entry.response.content.mimeType ?? "—" },
    { label: copy.started, value: entry.startedDateTime ? new Date(entry.startedDateTime).toLocaleString(locale) : "—" },
    { label: copy.duration, value: formatTime(entry.time, locale) },
    { label: copy.size, value: formatBytes(transferred(entry), locale, { maximumFractionDigits: 1 }) },
    { label: copy.protocol, value: entry.response.httpVersion ?? entry.request.httpVersion ?? "—" },
    { label: copy.server, value: entry.serverIPAddress ?? "—" },
    { label: copy.connection, value: entry.connection ?? "—" },
    { label: copy.redirect, value: entry.response.redirectURL || "—" },
  ]), { headingLevel: 3, className: "anyfile-har-viewer__section" });
}

function renderDetail(host: HTMLElement, entry: HarEntry, locale: string, copy: Copy) {
  const timingPairs = Object.entries(entry.timings).map(([name, value]) => ({ name, value: formatTime(value, locale) }));
  const post = entry.request.postData;
  host.replaceChildren(
    overview(entry, locale, copy),
    pairsSection(copy.query, entry.request.queryString, copy),
    pairsSection(copy.requestHeaders, entry.request.headers, copy),
    previewSection(copy.requestBody, post?.text, false, copy),
    pairsSection(copy.responseHeaders, entry.response.headers, copy),
    previewSection(copy.responseBody, entry.response.content.text, entry.response.content.encoding === "base64", copy),
    pairsSection(copy.timings, timingPairs, copy),
  );
}

const extraStyles = `
  .anyfile-har-viewer .anyfile-inspector__body--split { grid-template-columns:minmax(420px,1.05fr) minmax(340px,.95fr); }
  .anyfile-har-viewer .anyfile-inspector__sidebar { padding:0; }
  .anyfile-har-viewer .anyfile-inspector__viewport { padding:4px 18px 24px; }
  .anyfile-har-viewer__table { table-layout:fixed; }
  .anyfile-har-viewer__url { display:block; width:100%; overflow:hidden; border:0; padding:0; background:transparent; color:inherit; cursor:pointer; font:inherit; text-align:start; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-har-viewer__status { font-variant-numeric:tabular-nums; font-weight:650; }
  .anyfile-har-viewer__status[data-error='true'] { color:${viewerTheme.danger}; }
  .anyfile-har-viewer__section { margin:0; padding:12px 0; border-bottom:1px solid ${viewerTheme.border}; }
`;

export function createHarView(fileName: string, document: HarDocument, locale: Locale) {
  const copy = copyFor(locale);
  const totalTime = document.entries.reduce((sum, entry) => sum + Math.max(entry.time, 0), 0);
  const totalBytes = document.entries.reduce((sum, entry) => sum + transferred(entry), 0);

  const shell = createInspectorShell({
    className: "anyfile-har-viewer",
    title: fileName,
    stats: [
      `${document.entries.length.toLocaleString(locale)} ${copy.requests}`,
      `${document.pageCount.toLocaleString(locale)} ${copy.pages}`,
      `${copy.totalTime}: ${formatTime(totalTime, locale)}`,
      `${copy.transferred}: ${formatBytes(totalBytes, locale, { maximumFractionDigits: 1 })}`,
    ],
    layout: "split",
    extraStyles,
  });

  const table = createDataTable({
    className: "anyfile-har-viewer__table",
    columns: [
      { label: copy.method, width: "62px", nowrap: true },
      { label: copy.status, width: "58px", nowrap: true },
      { label: copy.url },
      { label: copy.duration, width: "76px", align: "end", nowrap: true },
    ],
    emptyMessage: copy.empty,
  });

  let page = 0;
  let selected = document.entries[0];
  let visible: readonly HarEntry[] = document.entries;

  const pager = createPager({
    previousLabel: copy.previous,
    nextLabel: copy.next,
    onPageChange: (nextPage) => {
      page = nextPage;
      render();
    },
  });

  const render = () => {
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    page = Math.min(page, pageCount - 1);
    const start = page * PAGE_SIZE;
    const entries = visible.slice(start, start + PAGE_SIZE);
    table.setRows(entries.map((entry) => {
      const urlBtn = el("button", { className: "anyfile-har-viewer__url", title: entry.request.url, attrs: { type: "button" } }, entry.request.url);
      const statusText = el("span", {
        className: "anyfile-har-viewer__status",
        dataset: { error: String(entry.response.status >= 400) },
      }, String(entry.response.status));
      return {
        className: "anyfile-har-viewer__row",
        interactive: true,
        selected: entry === selected,
        dataset: { entryIndex: String(document.entries.indexOf(entry)) },
        cells: [entry.request.method, statusText, urlBtn, formatTime(entry.time, locale)],
      };
    }));

    if (visible.length === 0) shell.viewport.replaceChildren();
    else if (selected) renderDetail(shell.viewport, selected, locale, copy);
    pager.update({ page, pageSize: PAGE_SIZE, total: visible.length });
  };

  const filter = createFilterInput({
    placeholder: copy.filter,
    dataset: { harFilter: "" },
    onInput: (query) => {
      visible = query ? document.entries.filter((entry) => [
        entry.request.method, String(entry.response.status), entry.request.url, entry.response.content.mimeType ?? "",
      ].some((value) => value.toLowerCase().includes(query))) : document.entries;
      page = 0;
      selected = visible[0];
      render();
    },
  });

  const onRowClick = (event: Event) => {
    const row = (event.target as Element).closest<HTMLElement>("[data-entry-index]");
    if (!row || row.dataset.entryIndex === undefined) return;
    selected = document.entries[Number(row.dataset.entryIndex)];
    render();
  };
  table.tbody.addEventListener("click", onRowClick);

  shell.header.append(filter.input, pager.element);
  shell.sidebar!.append(table.element);
  shell.onDispose(() => {
    table.tbody.removeEventListener("click", onRowClick);
    filter.dispose();
    pager.dispose();
    table.dispose();
  });

  render();
  return { root: shell.root, dispose: () => shell.dispose() };
}
