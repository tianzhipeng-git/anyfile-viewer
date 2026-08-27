import { tableViewerStyles } from "./styles";

export type TableViewerOption = {
  readonly id: string;
  readonly label: string;
};

export type TableViewerColumn = {
  readonly label: string;
  readonly type?: string;
};

export type TableViewerPage = {
  readonly columns: readonly TableViewerColumn[];
  readonly rows: readonly (readonly string[])[];
  readonly rowOffset: number;
  readonly hasMore: boolean;
  readonly meta: string;
  readonly emptyMessage: string;
};

export type PagedTableViewerOptions = {
  readonly className: string;
  readonly fileName: string;
  readonly options: readonly TableViewerOption[];
  readonly selectorLabel: string;
  readonly selectorDataAttribute: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly queryFailedMessage: string;
  readonly signal: AbortSignal;
  readonly loadPage: (
    optionId: string,
    pageIndex: number,
  ) => TableViewerPage | Promise<TableViewerPage>;
};

export type PagedTableViewer = {
  readonly root: HTMLElement;
  dispose(): void;
};

function renderMessage(viewport: HTMLElement, message: string, role?: "alert") {
  const element = document.createElement("div");
  element.className = "anyfile-table-viewer__empty";
  if (role) element.setAttribute("role", role);
  element.textContent = message;
  viewport.replaceChildren(element);
}

function renderTable(viewport: HTMLElement, page: TableViewerPage) {
  if (page.rows.length === 0 || page.columns.length === 0) {
    renderMessage(viewport, page.emptyMessage);
    return;
  }

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "anyfile-table-viewer__row-number";
  corner.scope = "col";
  headerRow.append(corner);
  for (const column of page.columns) {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = column.label;
    header.title = column.type ? `${column.label} (${column.type})` : column.label;
    if (column.type) {
      const type = document.createElement("span");
      type.className = "anyfile-table-viewer__type";
      type.textContent = column.type;
      header.append(type);
    }
    headerRow.append(header);
  }
  head.append(headerRow);
  table.append(head);

  const body = document.createElement("tbody");
  page.rows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("tr");
    const rowNumber = document.createElement("th");
    rowNumber.className = "anyfile-table-viewer__row-number";
    rowNumber.scope = "row";
    rowNumber.textContent = String(page.rowOffset + rowIndex + 1);
    rowElement.append(rowNumber);
    for (let columnIndex = 0; columnIndex < page.columns.length; columnIndex += 1) {
      const cell = document.createElement("td");
      const value = row[columnIndex] ?? "";
      cell.textContent = value;
      cell.title = value;
      rowElement.append(cell);
    }
    body.append(rowElement);
  });
  table.append(body);
  viewport.replaceChildren(table);
}

function createRoot(options: PagedTableViewerOptions) {
  const root = document.createElement("div");
  root.className = `anyfile-table-viewer ${options.className}`;
  const style = document.createElement("style");
  style.textContent = tableViewerStyles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-table-viewer__toolbar";
  const title = document.createElement("strong");
  title.className = "anyfile-table-viewer__name";
  title.textContent = options.fileName;
  title.title = options.fileName;
  const select = document.createElement("select");
  select.dataset[options.selectorDataAttribute] = "";
  select.setAttribute("aria-label", options.selectorLabel);
  for (const item of options.options) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    select.append(option);
  }
  select.hidden = options.options.length <= 1;
  const previous = document.createElement("button");
  previous.type = "button";
  previous.dataset.previous = "";
  previous.textContent = options.previousLabel;
  const next = document.createElement("button");
  next.type = "button";
  next.dataset.next = "";
  next.textContent = options.nextLabel;
  const meta = document.createElement("span");
  meta.className = "anyfile-table-viewer__meta";
  meta.dataset.meta = "";
  const viewport = document.createElement("div");
  viewport.className = "anyfile-table-viewer__viewport";
  viewport.dataset.viewport = "";
  toolbar.append(title, select, previous, next, meta);
  root.append(style, toolbar, viewport);
  return { root, select, previous, next, meta, viewport };
}

export async function createPagedTableViewer(
  options: PagedTableViewerOptions,
): Promise<PagedTableViewer> {
  const elements = createRoot(options);
  let pageIndex = 0;
  let currentPage: TableViewerPage | undefined;
  let requestId = 0;
  let active = true;

  const applyPage = (page: TableViewerPage, currentRequest: number) => {
    if (!active || options.signal.aborted || currentRequest !== requestId) return;
    currentPage = page;
    renderTable(elements.viewport, page);
    elements.meta.textContent = page.meta;
  };
  const finishRequest = (currentRequest: number) => {
    if (active && currentRequest === requestId) {
      elements.select.disabled = false;
      elements.previous.disabled = pageIndex === 0;
      elements.next.disabled = !currentPage?.hasMore;
    }
  };
  const handleError = (error: unknown, showError: boolean) => {
    if (!showError) throw error;
    if (!active || options.signal.aborted) return;
    renderMessage(elements.viewport, options.queryFailedMessage, "alert");
  };
  const loadPage = (showError: boolean): void | Promise<void> => {
    const currentRequest = ++requestId;
    elements.previous.disabled = true;
    elements.next.disabled = true;
    elements.select.disabled = true;
    try {
      const result = options.loadPage(elements.select.value, pageIndex);
      if (result instanceof Promise) {
        return result
          .then((page) => applyPage(page, currentRequest))
          .catch((error: unknown) => handleError(error, showError))
          .finally(() => finishRequest(currentRequest));
      }
      applyPage(result, currentRequest);
    } catch (error) {
      handleError(error, showError);
    }
    finishRequest(currentRequest);
  };
  const changeOption = () => {
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
  elements.select.addEventListener("change", changeOption);
  elements.previous.addEventListener("click", previousPage);
  elements.next.addEventListener("click", nextPage);

  try {
    await loadPage(false);
  } catch (error) {
    active = false;
    elements.select.removeEventListener("change", changeOption);
    elements.previous.removeEventListener("click", previousPage);
    elements.next.removeEventListener("click", nextPage);
    throw error;
  }

  return {
    root: elements.root,
    dispose() {
      if (!active) return;
      active = false;
      requestId += 1;
      elements.select.removeEventListener("change", changeOption);
      elements.previous.removeEventListener("click", previousPage);
      elements.next.removeEventListener("click", nextPage);
      elements.root.remove();
    },
  };
}
