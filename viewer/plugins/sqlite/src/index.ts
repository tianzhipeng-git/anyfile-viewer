import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";
import { createPagedTableViewer } from "@anyfile/viewer-ui";

import { sqliteManifest } from "./manifest";
import { createSQLiteSession, type SQLiteSession } from "./session";

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
  unsupported: string;
};

function getCopy(locale: OpenViewerContext["locale"]): Copy {
  return selectMessages(locale, { en: {
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
      unsupported: "This browser does not support WebAssembly.",
    }, "zh-CN": {
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
    unsupported: "当前浏览器不支持 WebAssembly。",
    } });
}

async function mount(fileName: string, session: SQLiteSession, signal: AbortSignal, copy: Copy) {
  return createPagedTableViewer({
    className: "anyfile-sqlite-viewer",
    fileName,
    options: session.tables.map((table) => ({ id: table, label: table })),
    selectorLabel: copy.table,
    selectorDataAttribute: "table",
    previousLabel: copy.previous,
    nextLabel: copy.next,
    queryFailedMessage: copy.queryFailed,
    signal,
    async loadPage(table, pageIndex) {
      const offset = pageIndex * PAGE_SIZE;
      const page = await session.query(table, offset, PAGE_SIZE);
      return {
        columns: page.columns.map((column) => ({ label: column.name, type: column.type })),
        rows: page.rows,
        rowOffset: offset,
        hasMore: page.hasMore,
        meta: page.rows.length === 0
          ? "0"
          : copy.page(offset + 1, offset + page.rows.length, page.hasMore),
        emptyMessage: copy.empty,
      };
    },
  });
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
      throw new ViewerError("unsupported-environment", copy.unsupported);
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
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof RangeError || error instanceof ViewerError && error.code === "resource-limit") {
      throw new ViewerError("resource-limit", copy.tooLarge, { cause: error });
    }
    if (error instanceof ViewerError && error.code === "unsupported-environment") {
      throw new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const sqliteViewer: FileViewerPlugin = { manifest: sqliteManifest, open: openSQLite };
export { sqliteManifest } from "./manifest";
