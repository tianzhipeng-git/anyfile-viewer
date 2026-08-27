import { read, utils, type WorkBook, type WorkSheet } from "xlsx";
import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { excelManifest } from "./manifest";
import { abortError, readBlob } from "./read-blob";
import { excelViewerStyles } from "./styles";

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

function getCopy(locale: string): ExcelCopy {
  if (!locale.toLowerCase().startsWith("zh")) {
    return {
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
    };
  }
  return {
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
  };
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

function renderWorkbook(
  root: HTMLElement,
  sheets: Sheet[],
  signal: AbortSignal,
  locale: string,
  copy: ExcelCopy,
) {
  const sheetSelect = root.querySelector<HTMLSelectElement>("[data-sheet]")!;
  const previousButton = root.querySelector<HTMLButtonElement>("[data-previous]")!;
  const nextButton = root.querySelector<HTMLButtonElement>("[data-next]")!;
  const meta = root.querySelector<HTMLElement>("[data-meta]")!;
  const viewport = root.querySelector<HTMLElement>("[data-viewport]")!;
  let page = 0;

  sheets.forEach((sheet, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = sheet.sheet;
    sheetSelect.append(option);
  });

  const currentSheet = () => sheets[Number(sheetSelect.value)];

  const renderPage = () => {
    if (signal.aborted) return;
    const sheet = currentSheet();
    viewport.replaceChildren();
    if (!sheet) {
      const empty = document.createElement("div");
      empty.className = "anyfile-excel-viewer__empty";
      empty.textContent = copy.emptyWorkbook;
      viewport.append(empty);
      meta.textContent = "0 个工作表";
      previousButton.disabled = true;
      nextButton.disabled = true;
      return;
    }

    const rowCount = sheet.data.length;
    const actualColumnCount = sheet.data.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    const columnCount = Math.min(actualColumnCount, MAX_COLUMNS);
    const pageCount = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
    page = Math.min(page, pageCount - 1);
    const firstRow = page * PAGE_SIZE + 1;
    const lastRow = Math.min(rowCount, firstRow + PAGE_SIZE - 1);
    previousButton.disabled = page === 0;
    nextButton.disabled = page >= pageCount - 1;
    meta.textContent = rowCount === 0
      ? copy.emptySheetMeta(sheet.sheet)
      : copy.sheetRows(firstRow, lastRow, rowCount, actualColumnCount > MAX_COLUMNS);

    if (rowCount === 0 || columnCount === 0) {
      const empty = document.createElement("div");
      empty.className = "anyfile-excel-viewer__empty";
      empty.textContent = copy.emptySheet;
      viewport.append(empty);
      return;
    }

    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "anyfile-excel-viewer__row-number";
    corner.scope = "col";
    headRow.append(corner);
    for (let column = 1; column <= columnCount; column += 1) {
      const header = document.createElement("th");
      header.scope = "col";
      header.textContent = columnLabel(column);
      headRow.append(header);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement("tbody");
    for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
      const rowElement = document.createElement("tr");
      const rowHeader = document.createElement("th");
      rowHeader.className = "anyfile-excel-viewer__row-number";
      rowHeader.scope = "row";
      rowHeader.textContent = String(rowNumber);
      rowElement.append(rowHeader);
      const row = sheet.data[rowNumber - 1];
      for (let column = 1; column <= columnCount; column += 1) {
        const cellElement = document.createElement("td");
        const text = formatCellValue(row[column - 1], locale);
        cellElement.textContent = text;
        cellElement.title = text;
        rowElement.append(cellElement);
      }
      body.append(rowElement);
    }
    table.append(body);
    viewport.append(table);
  };

  const changeSheet = () => {
    page = 0;
    renderPage();
  };
  const previousPage = () => {
    page -= 1;
    renderPage();
  };
  const nextPage = () => {
    page += 1;
    renderPage();
  };
  sheetSelect.addEventListener("change", changeSheet);
  previousButton.addEventListener("click", previousPage);
  nextButton.addEventListener("click", nextPage);
  renderPage();

  return () => {
    sheetSelect.removeEventListener("change", changeSheet);
    previousButton.removeEventListener("click", previousPage);
    nextButton.removeEventListener("click", nextPage);
  };
}

function createViewerRoot(fileName: string, copy: ExcelCopy) {
  const root = document.createElement("div");
  root.className = "anyfile-excel-viewer";
  const style = document.createElement("style");
  style.textContent = excelViewerStyles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-excel-viewer__toolbar";
  const name = document.createElement("strong");
  name.className = "anyfile-excel-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const select = document.createElement("select");
  select.dataset.sheet = "";
  select.setAttribute("aria-label", copy.chooseSheet);
  const previous = document.createElement("button");
  previous.type = "button";
  previous.dataset.previous = "";
  previous.textContent = copy.previous;
  const next = document.createElement("button");
  next.type = "button";
  next.dataset.next = "";
  next.textContent = copy.next;
  const meta = document.createElement("span");
  meta.className = "anyfile-excel-viewer__meta";
  meta.dataset.meta = "";
  const viewport = document.createElement("div");
  viewport.className = "anyfile-excel-viewer__viewport";
  viewport.dataset.viewport = "";
  toolbar.append(name, select, previous, next, meta);
  root.append(style, toolbar, viewport);
  return root;
}

async function openExcel(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = getCopy(context.locale);
  let disposed = false;
  let parsed = false;
  let removeListeners: (() => void) | undefined;
  const root = createViewerRoot(file.name, copy);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    removeListeners?.();
    root.remove();
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
    container.append(root);
    removeListeners = renderWorkbook(root, sheets, signal, context.locale, copy);
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
