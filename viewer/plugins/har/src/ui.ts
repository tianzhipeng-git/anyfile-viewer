import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

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

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatBytes(value: number | undefined, locale: string) {
  if (value === undefined || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB"];
  let size = value;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units[unit]}`;
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

function section(title: string) {
  const wrapper = node("section", "anyfile-har-viewer__section");
  wrapper.append(node("h3", undefined, title));
  return wrapper;
}

function pairsSection(title: string, pairs: readonly HarNameValue[], copy: Copy) {
  const wrapper = section(title);
  if (pairs.length === 0) {
    wrapper.append(node("p", "anyfile-har-viewer__muted", copy.noData));
    return wrapper;
  }
  const table = node("table", "anyfile-har-viewer__pairs");
  const body = node("tbody");
  for (const pair of pairs) {
    const row = node("tr");
    row.append(node("th", undefined, pair.name), node("td", undefined, pair.value));
    body.append(row);
  }
  table.append(body);
  wrapper.append(table);
  return wrapper;
}

function previewSection(title: string, text: string | undefined, encoded: boolean, copy: Copy) {
  const wrapper = section(title);
  if (!text) {
    wrapper.append(node("p", "anyfile-har-viewer__muted", copy.noData));
    return wrapper;
  }
  if (encoded) wrapper.append(node("p", "anyfile-har-viewer__note", copy.encoded));
  const preview = text.slice(0, PREVIEW_LIMIT);
  wrapper.append(node("pre", "anyfile-har-viewer__preview", preview));
  if (preview.length < text.length) wrapper.append(node("p", "anyfile-har-viewer__note", copy.truncated));
  return wrapper;
}

function overview(entry: HarEntry, locale: string, copy: Copy) {
  const wrapper = section(copy.overview);
  const list = node("dl", "anyfile-har-viewer__overview");
  const items = [
    [copy.method, entry.request.method], [copy.status, `${entry.response.status} ${entry.response.statusText ?? ""}`.trim()],
    [copy.url, entry.request.url], [copy.type, entry.response.content.mimeType ?? "—"],
    [copy.started, entry.startedDateTime ? new Date(entry.startedDateTime).toLocaleString(locale) : "—"],
    [copy.duration, formatTime(entry.time, locale)], [copy.size, formatBytes(transferred(entry), locale)],
    [copy.protocol, entry.response.httpVersion ?? entry.request.httpVersion ?? "—"],
    [copy.server, entry.serverIPAddress ?? "—"], [copy.connection, entry.connection ?? "—"],
    [copy.redirect, entry.response.redirectURL || "—"],
  ];
  for (const [label, value] of items) list.append(node("dt", undefined, label), node("dd", undefined, value));
  wrapper.append(list);
  return wrapper;
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

function styles() {
  const style = node("style");
  style.textContent = `
    .anyfile-har-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font:13px/1.45 var(--viewer-font-family,system-ui); }
    .anyfile-har-viewer__toolbar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; padding:12px 16px; border-bottom:1px solid var(--viewer-border,#ddd); background:color-mix(in srgb,var(--viewer-background,#fff) 96%,var(--viewer-foreground,#111)); }
    .anyfile-har-viewer__title { min-width:160px; max-width:320px; overflow:hidden; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-har-viewer__stat { color:color-mix(in srgb,var(--viewer-foreground,#111) 62%,transparent); white-space:nowrap; }
    .anyfile-har-viewer__filter { box-sizing:border-box; min-width:220px; flex:1; padding:7px 10px; border:1px solid var(--viewer-border,#ddd); border-radius:6px; background:var(--viewer-background,#fff); color:inherit; }
    .anyfile-har-viewer__pager { display:flex; align-items:center; gap:8px; }
    .anyfile-har-viewer__pager button { padding:6px 10px; border:1px solid var(--viewer-border,#ddd); border-radius:6px; background:var(--viewer-background,#fff); color:inherit; cursor:pointer; }
    .anyfile-har-viewer__pager button:disabled { cursor:default; opacity:.45; }
    .anyfile-har-viewer__viewport { min-height:0; flex:1; overflow:auto; }
    .anyfile-har-viewer__content { display:grid; grid-template-columns:minmax(440px,1.05fr) minmax(360px,.95fr); min-width:800px; }
    .anyfile-har-viewer__list { border-inline-end:1px solid var(--viewer-border,#ddd); }
    .anyfile-har-viewer__table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .anyfile-har-viewer__table th { position:sticky; top:0; z-index:1; padding:8px 10px; border-bottom:1px solid var(--viewer-border,#ddd); background:color-mix(in srgb,var(--viewer-background,#fff) 94%,var(--viewer-foreground,#111)); text-align:start; }
    .anyfile-har-viewer__table td { padding:8px 10px; border-bottom:1px solid color-mix(in srgb,var(--viewer-border,#ddd) 72%,transparent); vertical-align:top; }
    .anyfile-har-viewer__table th:nth-child(1) { width:62px; } .anyfile-har-viewer__table th:nth-child(2) { width:58px; } .anyfile-har-viewer__table th:nth-child(4) { width:72px; }
    .anyfile-har-viewer__row { cursor:pointer; } .anyfile-har-viewer__row:hover, .anyfile-har-viewer__row[data-selected='true'] { background:color-mix(in srgb,var(--viewer-accent,#2563eb) 9%,transparent); }
    .anyfile-har-viewer__url { display:block; width:100%; overflow:hidden; border:0; padding:0; background:transparent; color:inherit; cursor:pointer; font:inherit; text-align:start; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-har-viewer__status { font-variant-numeric:tabular-nums; font-weight:650; } .anyfile-har-viewer__status[data-error='true'] { color:#b42318; }
    .anyfile-har-viewer__detail { min-width:0; padding:4px 18px 24px; }
    .anyfile-har-viewer__section { padding:12px 0; border-bottom:1px solid var(--viewer-border,#ddd); } .anyfile-har-viewer__section h3 { margin:0 0 9px; font-size:13px; }
    .anyfile-har-viewer__overview { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:6px 12px; margin:0; } .anyfile-har-viewer__overview dt { color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); } .anyfile-har-viewer__overview dd { min-width:0; margin:0; overflow-wrap:anywhere; }
    .anyfile-har-viewer__pairs { width:100%; border-collapse:collapse; table-layout:fixed; } .anyfile-har-viewer__pairs th, .anyfile-har-viewer__pairs td { padding:4px 6px; vertical-align:top; text-align:start; overflow-wrap:anywhere; } .anyfile-har-viewer__pairs th { width:34%; color:color-mix(in srgb,var(--viewer-foreground,#111) 62%,transparent); font-weight:550; }
    .anyfile-har-viewer__preview { max-height:260px; overflow:auto; margin:0; padding:10px; border-radius:6px; background:color-mix(in srgb,var(--viewer-background,#fff) 90%,var(--viewer-foreground,#111)); white-space:pre-wrap; overflow-wrap:anywhere; font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .anyfile-har-viewer__muted, .anyfile-har-viewer__note, .anyfile-har-viewer__empty { color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); } .anyfile-har-viewer__note { margin:5px 0; font-size:12px; } .anyfile-har-viewer__empty { padding:40px 16px; text-align:center; }
  `;
  return style;
}

export function createHarView(fileName: string, document: HarDocument, locale: Locale) {
  const copy = copyFor(locale);
  const root = node("div", "anyfile-har-viewer");
  const toolbar = node("div", "anyfile-har-viewer__toolbar");
  const title = node("div", "anyfile-har-viewer__title", fileName);
  title.title = fileName;
  const totalTime = document.entries.reduce((sum, entry) => sum + Math.max(entry.time, 0), 0);
  const totalBytes = document.entries.reduce((sum, entry) => sum + transferred(entry), 0);
  const stats = [
    `${document.entries.length.toLocaleString(locale)} ${copy.requests}`,
    `${document.pageCount.toLocaleString(locale)} ${copy.pages}`,
    `${copy.totalTime}: ${formatTime(totalTime, locale)}`,
    `${copy.transferred}: ${formatBytes(totalBytes, locale)}`,
  ].map((text) => node("span", "anyfile-har-viewer__stat", text));
  const filter = node("input", "anyfile-har-viewer__filter") as HTMLInputElement;
  filter.type = "search";
  filter.placeholder = copy.filter;
  filter.setAttribute("aria-label", copy.filter);
  filter.dataset.harFilter = "";
  const pager = node("div", "anyfile-har-viewer__pager");
  const previous = node("button", undefined, copy.previous) as HTMLButtonElement;
  const meta = node("span");
  const next = node("button", undefined, copy.next) as HTMLButtonElement;
  previous.type = next.type = "button";
  previous.dataset.action = "previous";
  next.dataset.action = "next";
  pager.append(previous, meta, next);
  toolbar.append(title, ...stats, filter, pager);

  const viewport = node("div", "anyfile-har-viewer__viewport");
  const content = node("div", "anyfile-har-viewer__content");
  const list = node("div", "anyfile-har-viewer__list");
  const table = node("table", "anyfile-har-viewer__table");
  const head = node("thead");
  const header = node("tr");
  for (const label of [copy.method, copy.status, copy.url, copy.duration]) header.append(node("th", undefined, label));
  head.append(header);
  const body = node("tbody");
  table.append(head, body);
  list.append(table);
  const detail = node("div", "anyfile-har-viewer__detail");
  content.append(list, detail);
  viewport.append(content);
  root.append(styles(), toolbar, viewport);

  let page = 0;
  let selected = document.entries[0];
  let visible: readonly HarEntry[] = document.entries;
  const render = () => {
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    page = Math.min(page, pageCount - 1);
    const start = page * PAGE_SIZE;
    const entries = visible.slice(start, start + PAGE_SIZE);
    const rows = entries.map((entry) => {
      const row = node("tr", "anyfile-har-viewer__row");
      row.dataset.selected = String(entry === selected);
      row.dataset.entryIndex = String(document.entries.indexOf(entry));
      const urlCell = node("td");
      const url = node("button", "anyfile-har-viewer__url", entry.request.url);
      url.type = "button";
      url.title = entry.request.url;
      urlCell.append(url);
      const status = node("td", "anyfile-har-viewer__status", String(entry.response.status));
      status.dataset.error = String(entry.response.status >= 400);
      row.append(node("td", undefined, entry.request.method), status, urlCell, node("td", undefined, formatTime(entry.time, locale)));
      return row;
    });
    body.replaceChildren(...rows);
    if (visible.length === 0) {
      const row = node("tr");
      const cell = node("td", "anyfile-har-viewer__empty", copy.empty);
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
      detail.replaceChildren();
    } else if (selected) {
      renderDetail(detail, selected, locale, copy);
    }
    meta.textContent = visible.length === 0 ? "0" : `${start + 1}–${start + entries.length} / ${visible.length}`;
    previous.disabled = page === 0;
    next.disabled = page >= pageCount - 1;
  };

  const onInput = () => {
    const query = filter.value.trim().toLowerCase();
    visible = query ? document.entries.filter((entry) => [
      entry.request.method, String(entry.response.status), entry.request.url, entry.response.content.mimeType ?? "",
    ].some((value) => value.toLowerCase().includes(query))) : document.entries;
    page = 0;
    selected = visible[0];
    render();
  };
  const onClick = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>("[data-action], [data-entry-index]");
    if (!target) return;
    if (target.dataset.action === "previous") page -= 1;
    else if (target.dataset.action === "next") page += 1;
    else if (target.dataset.entryIndex !== undefined) selected = document.entries[Number(target.dataset.entryIndex)];
    render();
  };
  filter.addEventListener("input", onInput);
  root.addEventListener("click", onClick);
  render();
  return {
    root,
    dispose() {
      filter.removeEventListener("input", onInput);
      root.removeEventListener("click", onClick);
      root.remove();
    },
  };
}
