import { read, utils, type WorkBook, type WorkSheet } from "xlsx";
import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";
import { createPagedTableViewer, type TableViewerPage } from "@anyfile/viewer-ui";

import { excelManifest } from "./manifest";
import { abortError, readBlob } from "./read-blob";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PARSED_CELLS = 1_000_000;
const MAX_WORKSHEETS = 100;
const MAX_COLUMNS = 200;
const PAGE_SIZE = 100;
const ZIP_BASED_EXTENSIONS = [".xlsx", ".xlsm", ".xlsb", ".ods", ".numbers"];

type Sheet = {
  sheet: string;
  data: unknown[][];
};

function hasZipSignature(bytes: ArrayBuffer) {
  if (bytes.byteLength < 4) return false;
  const signature = new Uint8Array(bytes, 0, 4);
  return signature[0] === 0x50 && signature[1] === 0x4b && (
    (signature[2] === 0x03 && signature[3] === 0x04) ||
    (signature[2] === 0x05 && signature[3] === 0x06) ||
    (signature[2] === 0x07 && signature[3] === 0x08)
  );
}

function requiresZipContainer(fileName: string) {
  const normalizedName = fileName.toLowerCase();
  return ZIP_BASED_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}

type ExcelCopy = {
  chooseSheet: string;
  previous: string;
  next: string;
  emptyWorkbook: string;
  emptySheet: string;
  emptySheetMeta: (name: string) => string;
  sheetRows: (first: number, last: number, rows: number, truncated: boolean) => string;
  tooLarge: string;
  invalid: string;
  damaged: string;
  openFailed: string;
  reading: string;
  parsing: string;
  ready: string;
};

function getCopy(locale: OpenViewerContext["locale"]): ExcelCopy {
  return selectMessages(locale, { en: {
      chooseSheet: "Choose worksheet",
      previous: "Previous",
      next: "Next",
      emptyWorkbook: "The workbook contains no worksheets.",
      emptySheet: "This worksheet has no displayable cells.",
      emptySheetMeta: (name) => `${name} · Empty worksheet`,
      sheetRows: (first, last, rows, truncated) =>
        `${first}–${last} / ${rows} rows${truncated ? ` · Showing the first ${MAX_COLUMNS} columns` : ""}`,
      tooLarge: "The Excel workbook exceeds the browser-safe resource limit.",
      invalid: "The file is not a valid XLSX/XLSM workbook.",
      damaged: "The Excel workbook is damaged or contains unsupported content.",
      openFailed: "Unable to open the Excel workbook.",
      reading: "Reading the Excel workbook…",
      parsing: "Parsing worksheets…",
      ready: "Excel workbook opened",
    }, "zh-CN": {
    chooseSheet: "选择工作表",
    previous: "上一页",
    next: "下一页",
    emptyWorkbook: "工作簿中没有工作表。",
    emptySheet: "这个工作表没有可显示的单元格。",
    emptySheetMeta: (name) => `${name} · 空工作表`,
    sheetRows: (first, last, rows, truncated) =>
      `${first}–${last} / ${rows} 行${truncated ? ` · 仅显示前 ${MAX_COLUMNS} 列` : ""}`,
    tooLarge: "Excel 工作簿超过浏览器安全资源上限。",
    invalid: "文件内容不是有效的 XLSX/XLSM 工作簿。",
    damaged: "Excel 工作簿已损坏或包含不支持的内容。",
    openFailed: "无法打开 Excel 工作簿。",
    reading: "正在读取 Excel 工作簿…",
    parsing: "正在解析工作表…",
    ready: "Excel 工作簿已打开",
    } });
}

function columnLabel(index: number) {
  let label = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
}

function formatCellValue(value: unknown, locale: string) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleString(locale);
  return String(value);
}

function parseSheet(sheet: WorkSheet, name: string, remainingCells: number, resourceMessage: string): Sheet {
  if (!sheet["!ref"]) return { sheet: name, data: [] };
  const sourceRange = utils.decode_range(sheet["!ref"]);
  const lastColumn = Math.min(sourceRange.e.c, MAX_COLUMNS - 1);
  const rowCount = sourceRange.e.r + 1;
  const columnCount = lastColumn + 1;
  if (rowCount * columnCount > remainingCells) {
    throw new ViewerError("resource-limit", resourceMessage);
  }

  const data = utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: true,
    range: { s: { r: 0, c: 0 }, e: { r: sourceRange.e.r, c: lastColumn } },
  });
  return { sheet: name, data };
}

function parseWorkbook(bytes: ArrayBuffer, resourceMessage: string): Sheet[] {
  const workbook: WorkBook = read(bytes, {
    type: "array",
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellText: true,
    sheetRows: MAX_PARSED_CELLS + 1,
  });
  if (workbook.SheetNames.length > MAX_WORKSHEETS) {
    throw new ViewerError("resource-limit", resourceMessage);
  }

  let parsedCells = 0;
  return workbook.SheetNames.map((name) => {
    const sheet = parseSheet(
      workbook.Sheets[name],
      name,
      MAX_PARSED_CELLS - parsedCells,
      resourceMessage,
    );
    parsedCells += sheet.data.reduce((total, row) => total + row.length, 0);
    return sheet;
  });
}

function createWorkbookViewer(
  fileName: string,
  sheets: Sheet[],
  signal: AbortSignal,
  locale: string,
  copy: ExcelCopy,
) {
  return createPagedTableViewer({
    className: "anyfile-excel-viewer",
    fileName,
    options: sheets.map((sheet, index) => ({ id: String(index), label: sheet.sheet })),
    selectorLabel: copy.chooseSheet,
    selectorDataAttribute: "sheet",
    previousLabel: copy.previous,
    nextLabel: copy.next,
    queryFailedMessage: copy.openFailed,
    signal,
    loadPage(sheetId, requestedPage): TableViewerPage {
      const sheet = sheets[Number(sheetId)];
      if (!sheet) {
        return {
          columns: [],
          rows: [],
          rowOffset: 0,
          hasMore: false,
          meta: "0",
          emptyMessage: copy.emptyWorkbook,
        };
      }

      const rowCount = sheet.data.length;
      const actualColumnCount = sheet.data.reduce(
        (maximum, row) => Math.max(maximum, row.length),
        0,
      );
      const columnCount = Math.min(actualColumnCount, MAX_COLUMNS);
      const pageCount = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
      const pageIndex = Math.min(requestedPage, pageCount - 1);
      const rowOffset = pageIndex * PAGE_SIZE;
      const rows = sheet.data.slice(rowOffset, rowOffset + PAGE_SIZE).map((row) =>
        Array.from({ length: columnCount }, (_, index) => formatCellValue(row[index], locale))
      );
      return {
        columns: Array.from({ length: columnCount }, (_, index) => ({ label: columnLabel(index + 1) })),
        rows,
        rowOffset,
        hasMore: rowOffset + rows.length < rowCount,
        meta: rowCount === 0
          ? copy.emptySheetMeta(sheet.sheet)
          : copy.sheetRows(
              rowOffset + 1,
              rowOffset + rows.length,
              rowCount,
              actualColumnCount > MAX_COLUMNS,
            ),
        emptyMessage: copy.emptySheet,
      };
    },
  });
}

async function openExcel(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = getCopy(context.locale);
  let disposed = false;
  let parsed = false;
  let view: Awaited<ReturnType<typeof createWorkbookViewer>> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    if (signal.aborted) throw abortError();
    if (file.size > MAX_FILE_BYTES) {
      throw new ViewerError("resource-limit", copy.tooLarge);
    }
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const bytes = await readBlob(file.slice(0, file.size), signal);
    if (signal.aborted) throw abortError();
    if (requiresZipContainer(file.name) && !hasZipSignature(bytes)) {
      throw new ViewerError("invalid-file", copy.invalid);
    }
    reportProgress({ stage: "parsing", message: copy.parsing, loaded: file.size, total: file.size });
    const sheets = parseWorkbook(bytes, copy.tooLarge);
    if (signal.aborted) throw abortError();
    parsed = true;
    view = await createWorkbookViewer(file.name, sheets, signal, context.locale, copy);
    if (signal.aborted) throw abortError();
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError(parsed ? "open-failed" : "invalid-file", parsed ? copy.openFailed : copy.damaged, {
      cause: error,
    });
  }
}

export const excelViewer: FileViewerPlugin = {
  manifest: excelManifest,
  open: openExcel,
};

export { excelManifest } from "./manifest";
