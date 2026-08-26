import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { createDuckDBSession } from "./duckdb-session";
import { dataManifest } from "./manifest";
import { dataViewerStyles } from "./styles";
import type { DataPage, DataSession } from "./types";

const PAGE_SIZE = 100;

type Copy = {
  dataSet: string;
  previous: string;
  next: string;
  initializing: string;
  reading: string;
  ready: string;
  empty: string;
  page: (first: number, last: number, more: boolean) => string;
  queryFailed: string;
  invalid: string;
  tooLarge: string;
};

function getCopy(locale: string): Copy {
  if (!locale.toLowerCase().startsWith("zh")) {
    return {
      dataSet: "Choose table or data set",
      previous: "Previous",
      next: "Next",
      initializing: "Starting DuckDB…",
      reading: "Reading the data schema…",
      ready: "Data file opened",
      empty: "This data set contains no rows.",
      page: (first, last, more) => `${first}–${last}${more ? " · More rows available" : ""}`,
      queryFailed: "Unable to read this page.",
      invalid: "The file is damaged or is not a supported data file.",
      tooLarge: "The data file exceeds this format's browser-safe resource limit.",
    };
  }
  return {
    dataSet: "选择数据表或数据集",
    previous: "上一页",
    next: "下一页",
    initializing: "正在启动 DuckDB…",
    reading: "正在读取数据结构…",
    ready: "数据文件已打开",
    empty: "这个数据集没有可显示的行。",
    page: (first, last, more) => `${first}–${last}${more ? " · 还有更多行" : ""}`,
    queryFailed: "无法读取这一页数据。",
    invalid: "文件已损坏，或内容不是受支持的数据格式。",
    tooLarge: "数据文件超过该格式在浏览器中的安全资源上限。",
  };
}

function createRoot(fileName: string, session: DataSession, copy: Copy) {
  const root = document.createElement("div");
  root.className = "anyfile-data-viewer";
  const style = document.createElement("style");
  style.textContent = dataViewerStyles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-data-viewer__toolbar";
  const title = document.createElement("strong");
  title.className = "anyfile-data-viewer__name";
  title.textContent = fileName;
  title.title = fileName;
  const select = document.createElement("select");
  select.dataset.dataset = "";
  select.setAttribute("aria-label", copy.dataSet);
  for (const dataSet of session.dataSets) {
    const option = document.createElement("option");
    option.value = dataSet.id;
    option.textContent = dataSet.label;
    select.append(option);
  }
  select.hidden = session.dataSets.length === 1;
  const previous = document.createElement("button");
  previous.type = "button";
  previous.dataset.previous = "";
  previous.textContent = copy.previous;
  const next = document.createElement("button");
  next.type = "button";
  next.dataset.next = "";
  next.textContent = copy.next;
  const meta = document.createElement("span");
  meta.className = "anyfile-data-viewer__meta";
  meta.dataset.meta = "";
  const viewport = document.createElement("div");
  viewport.className = "anyfile-data-viewer__viewport";
  viewport.dataset.viewport = "";
  toolbar.append(title, select, previous, next, meta);
  root.append(style, toolbar, viewport);
  return { root, select, previous, next, meta, viewport };
}

function renderTable(viewport: HTMLElement, page: DataPage, offset: number, copy: Copy) {
  viewport.replaceChildren();
  if (page.rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "anyfile-data-viewer__empty";
    empty.textContent = copy.empty;
    viewport.append(empty);
    return;
  }

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "anyfile-data-viewer__row-number";
  corner.scope = "col";
  headerRow.append(corner);
  for (const column of page.columns) {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = column.name;
    header.title = `${column.name} (${column.type})`;
    const type = document.createElement("span");
    type.className = "anyfile-data-viewer__type";
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
    rowNumber.className = "anyfile-data-viewer__row-number";
    rowNumber.scope = "row";
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

async function mountDataViewer(
  fileName: string,
  session: DataSession,
  signal: AbortSignal,
  copy: Copy,
) {
  const elements = createRoot(fileName, session, copy);
  let pageIndex = 0;
  let currentPage: DataPage | undefined;
  let requestId = 0;
  let active = true;

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
      elements.viewport.replaceChildren();
      const message = document.createElement("div");
      message.className = "anyfile-data-viewer__empty";
      message.setAttribute("role", "alert");
      message.textContent = copy.queryFailed;
      elements.viewport.append(message);
    } finally {
      if (active && currentRequest === requestId) {
        elements.select.disabled = false;
        elements.previous.disabled = pageIndex === 0;
        elements.next.disabled = !currentPage?.hasMore;
      }
    }
  };
  const changeDataSet = () => {
    pageIndex = 0;
    currentPage = undefined;
    void loadPage(true);
  };
  const previousPage = () => {
    pageIndex -= 1;
    void loadPage(true);
  };
  const nextPage = () => {
    pageIndex += 1;
    void loadPage(true);
  };
  elements.select.addEventListener("change", changeDataSet);
  elements.previous.addEventListener("click", previousPage);
  elements.next.addEventListener("click", nextPage);
  await loadPage(false);

  return {
    root: elements.root,
    dispose() {
      if (!active) return;
      active = false;
      requestId += 1;
      elements.select.removeEventListener("change", changeDataSet);
      elements.previous.removeEventListener("click", previousPage);
      elements.next.removeEventListener("click", nextPage);
      elements.root.remove();
    },
  };
}

async function openData(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = getCopy(context.locale);
  let session: DataSession | undefined;
  let view: Awaited<ReturnType<typeof mountDataViewer>> | undefined;
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
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      throw new ViewerError("unsupported-environment", "当前浏览器不支持 DuckDB-Wasm。");
    }
    reportProgress({ stage: "initializing", message: copy.initializing });
    session = await createDuckDBSession(file, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    reportProgress({ stage: "parsing", message: copy.reading });
    view = await mountDataViewer(file.name, session, signal, copy);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    container.append(view.root);
    signal.addEventListener("abort", abort, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    await dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
    if (error instanceof RangeError) {
      throw new ViewerError("resource-limit", copy.tooLarge, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const dataViewer: FileViewerPlugin = { manifest: dataManifest, open: openData };
export { dataManifest } from "./manifest";
