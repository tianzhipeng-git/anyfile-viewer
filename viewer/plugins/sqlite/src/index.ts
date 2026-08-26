import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { sqliteManifest } from "./manifest";
import { createSQLiteSession, type SQLitePage, type SQLiteSession } from "./session";
import { sqliteViewerStyles } from "./styles";

const PAGE_SIZE = 100;

type Copy = {
  table: string;
  previous: string;
  next: string;
  initializing: string;
  reading: string;
  ready: string;
  empty: string;
  queryFailed: string;
  page: (first: number, last: number, more: boolean) => string;
  invalid: string;
  tooLarge: string;
};

function getCopy(locale: string): Copy {
  if (!locale.toLowerCase().startsWith("zh")) {
    return {
      table: "Choose table",
      previous: "Previous",
      next: "Next",
      initializing: "Starting SQLite…",
      reading: "Reading database tables…",
      ready: "SQLite database opened",
      empty: "This table contains no rows.",
      queryFailed: "Unable to read this page.",
      page: (first, last, more) => `${first}–${last}${more ? " · More rows available" : ""}`,
      invalid: "The file is damaged or is not a supported SQLite database.",
      tooLarge: "The SQLite database exceeds the browser-safe resource limit.",
    };
  }
  return {
    table: "选择数据表",
    previous: "上一页",
    next: "下一页",
    initializing: "正在启动 SQLite…",
    reading: "正在读取数据库表…",
    ready: "SQLite 数据库已打开",
    empty: "这个数据表没有可显示的行。",
    queryFailed: "无法读取这一页数据。",
    page: (first, last, more) => `${first}–${last}${more ? " · 还有更多行" : ""}`,
    invalid: "文件已损坏，或内容不是受支持的 SQLite 数据库。",
    tooLarge: "SQLite 数据库超过浏览器安全资源上限。",
  };
}

function renderTable(viewport: HTMLElement, page: SQLitePage, offset: number, copy: Copy) {
  viewport.replaceChildren();
  if (page.rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "anyfile-sqlite-viewer__empty";
    empty.textContent = copy.empty;
    viewport.append(empty);
    return;
  }
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "anyfile-sqlite-viewer__row-number";
  headerRow.append(corner);
  for (const column of page.columns) {
    const header = document.createElement("th");
    header.textContent = column.name;
    header.title = `${column.name} (${column.type})`;
    const type = document.createElement("span");
    type.className = "anyfile-sqlite-viewer__type";
    type.textContent = column.type;
    header.append(type);
    headerRow.append(header);
  }
  head.append(headerRow);
  table.append(head);
  const body = document.createElement("tbody");
  page.rows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("tr");
    const rowNumber = document.createElement("th");
    rowNumber.className = "anyfile-sqlite-viewer__row-number";
    rowNumber.textContent = String(offset + rowIndex + 1);
    rowElement.append(rowNumber);
    for (const value of row) {
      const cell = document.createElement("td");
      cell.textContent = value;
      cell.title = value;
      rowElement.append(cell);
    }
    body.append(rowElement);
  });
  table.append(body);
  viewport.append(table);
}

function createRoot(fileName: string, session: SQLiteSession, copy: Copy) {
  const root = document.createElement("div");
  root.className = "anyfile-sqlite-viewer";
  const style = document.createElement("style");
  style.textContent = sqliteViewerStyles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-sqlite-viewer__toolbar";
  const title = document.createElement("strong");
  title.className = "anyfile-sqlite-viewer__name";
  title.textContent = fileName;
  title.title = fileName;
  const select = document.createElement("select");
  select.dataset.table = "";
  select.setAttribute("aria-label", copy.table);
  for (const table of session.tables) {
    const option = document.createElement("option");
    option.value = table;
    option.textContent = table;
    select.append(option);
  }
  select.hidden = session.tables.length === 1;
  const previous = document.createElement("button");
  previous.type = "button";
  previous.dataset.previous = "";
  previous.textContent = copy.previous;
  const next = document.createElement("button");
  next.type = "button";
  next.dataset.next = "";
  next.textContent = copy.next;
  const meta = document.createElement("span");
  meta.className = "anyfile-sqlite-viewer__meta";
  const viewport = document.createElement("div");
  viewport.className = "anyfile-sqlite-viewer__viewport";
  toolbar.append(title, select, previous, next, meta);
  root.append(style, toolbar, viewport);
  return { root, select, previous, next, meta, viewport };
}

async function mount(fileName: string, session: SQLiteSession, signal: AbortSignal, copy: Copy) {
  const elements = createRoot(fileName, session, copy);
  let pageIndex = 0;
  let currentPage: SQLitePage | undefined;
  let active = true;
  let requestId = 0;
  const loadPage = async (showError: boolean) => {
    const currentRequest = ++requestId;
    elements.previous.disabled = true;
    elements.next.disabled = true;
    elements.select.disabled = true;
    try {
      const offset = pageIndex * PAGE_SIZE;
      const page = await session.query(elements.select.value, offset, PAGE_SIZE);
      if (!active || signal.aborted || currentRequest !== requestId) return;
      currentPage = page;
      renderTable(elements.viewport, page, offset, copy);
      elements.meta.textContent = page.rows.length === 0
        ? "0"
        : copy.page(offset + 1, offset + page.rows.length, page.hasMore);
    } catch (error) {
      if (!showError || !active || signal.aborted) throw error;
      const message = document.createElement("div");
      message.className = "anyfile-sqlite-viewer__empty";
      message.setAttribute("role", "alert");
      message.textContent = copy.queryFailed;
      elements.viewport.replaceChildren(message);
    } finally {
      if (active && currentRequest === requestId) {
        elements.select.disabled = false;
        elements.previous.disabled = pageIndex === 0;
        elements.next.disabled = !currentPage?.hasMore;
      }
    }
  };
  const changeTable = () => { pageIndex = 0; currentPage = undefined; void loadPage(true); };
  const previousPage = () => { pageIndex -= 1; void loadPage(true); };
  const nextPage = () => { pageIndex += 1; void loadPage(true); };
  elements.select.addEventListener("change", changeTable);
  elements.previous.addEventListener("click", previousPage);
  elements.next.addEventListener("click", nextPage);
  await loadPage(false);
  return {
    root: elements.root,
    dispose() {
      if (!active) return;
      active = false;
      requestId += 1;
      elements.select.removeEventListener("change", changeTable);
      elements.previous.removeEventListener("click", previousPage);
      elements.next.removeEventListener("click", nextPage);
      elements.root.remove();
    },
  };
}

async function openSQLite(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = getCopy(context.locale);
  let session: SQLiteSession | undefined;
  let view: Awaited<ReturnType<typeof mount>> | undefined;
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", abort);
    view?.dispose();
    await session?.dispose();
  };
  const abort = () => void dispose();
  try {
    if (typeof WebAssembly === "undefined") {
      throw new ViewerError("unsupported-environment", "当前浏览器不支持 WebAssembly。");
    }
    reportProgress({ stage: "initializing", message: copy.initializing });
    session = await createSQLiteSession(file, signal);
    reportProgress({ stage: "parsing", message: copy.reading });
    view = await mount(file.name, session, signal, copy);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    container.append(view.root);
    signal.addEventListener("abort", abort, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    await dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    if (error instanceof RangeError) {
      throw new ViewerError("resource-limit", copy.tooLarge, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const sqliteViewer: FileViewerPlugin = { manifest: sqliteManifest, open: openSQLite };
export { sqliteManifest } from "./manifest";
