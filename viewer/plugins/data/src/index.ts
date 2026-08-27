import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";
import { createPagedTableViewer } from "@anyfile/viewer-ui";

import { createDuckDBSession } from "./duckdb-session";
import { dataManifest } from "./manifest";
import type { DataSession } from "./types";

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

async function mountDataViewer(
  fileName: string,
  session: DataSession,
  signal: AbortSignal,
  copy: Copy,
) {
  return createPagedTableViewer({
    className: "anyfile-data-viewer",
    fileName,
    options: session.dataSets,
    selectorLabel: copy.dataSet,
    selectorDataAttribute: "dataset",
    previousLabel: copy.previous,
    nextLabel: copy.next,
    queryFailedMessage: copy.queryFailed,
    signal,
    async loadPage(dataSetId, pageIndex) {
      const offset = pageIndex * PAGE_SIZE;
      const page = await session.query(dataSetId, offset, PAGE_SIZE);
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
