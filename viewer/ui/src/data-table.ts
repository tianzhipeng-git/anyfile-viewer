import { el, type ElChild } from "./dom";

export type SortDirection = "none" | "asc" | "desc";

export type DataTableColumn = {
  readonly label: string;
  readonly width?: string;
  readonly align?: "start" | "end";
  readonly mono?: boolean;
  readonly nowrap?: boolean;
  readonly sortable?: boolean;
  readonly initialSort?: "asc" | "desc";
  readonly sortAscLabel?: string;
  readonly sortDescLabel?: string;
  readonly className?: string;
};

export type DataTableRowObject = {
  readonly cells: readonly (string | Node)[];
  readonly className?: string;
  readonly dataset?: Readonly<Record<string, string | undefined>>;
  readonly selected?: boolean;
  readonly interactive?: boolean;
};

export type DataTableRow = readonly (string | Node)[] | DataTableRowObject;

export type DataTableOptions = {
  readonly columns: readonly DataTableColumn[];
  readonly rows?: readonly DataTableRow[];
  readonly emptyMessage?: string;
  readonly note?: string;
  readonly stickyHeader?: boolean;
  readonly bordered?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly onSort?: (columnIndex: number, direction: SortDirection) => void;
};

export type DataTable = {
  readonly element: HTMLDivElement;
  readonly table: HTMLTableElement;
  readonly thead: HTMLTableSectionElement;
  readonly tbody: HTMLTableSectionElement;
  setRows(rows: readonly DataTableRow[], options?: { readonly emptyMessage?: string; readonly note?: string }): void;
  getSort(): { readonly columnIndex: number; readonly direction: SortDirection };
  dispose(): void;
};

function isRowObject(row: DataTableRow): row is DataTableRowObject {
  return !Array.isArray(row);
}

function columnClasses(column: DataTableColumn, isCell: boolean): string {
  const classes: string[] = [];
  if (column.align === "end") classes.push("anyfile-inspector__col--end");
  if (column.nowrap) classes.push("anyfile-inspector__col--nowrap");
  if (isCell && column.mono) classes.push("anyfile-inspector__mono");
  if (column.className) classes.push(column.className);
  return classes.join(" ");
}

export function createDataTable(options: DataTableOptions): DataTable {
  const tableClasses = ["anyfile-inspector__table"];
  if (options.stickyHeader !== false) tableClasses.push("anyfile-inspector__table--sticky");
  if (options.bordered) tableClasses.push("anyfile-inspector__table--bordered");
  if (options.className) tableClasses.push(options.className);

  const table = el("table", tableClasses.join(" "));
  const thead = el("thead");
  const headerRow = el("tr");
  const tbody = el("tbody");
  const cleanups: Array<() => void> = [];
  const headerCells: HTMLTableCellElement[] = [];

  let sortColumn = -1;
  let sortDirection: SortDirection = "none";

  const syncSortHeaders = () => {
    headerCells.forEach((th, index) => {
      if (index === sortColumn && sortDirection !== "none") {
        th.setAttribute("aria-sort", sortDirection === "asc" ? "ascending" : "descending");
        th.dataset.sort = sortDirection;
      } else {
        th.removeAttribute("aria-sort");
        delete th.dataset.sort;
      }
    });
  };

  options.columns.forEach((column, index) => {
    const th = el("th", {
      className: columnClasses(column, false),
      attrs: { scope: "col" },
    });
    if (column.width) th.style.width = column.width;

    if (column.sortable) {
      const button = el("button", {
        className: "anyfile-inspector__sort-btn",
        attrs: { type: "button" },
      }, column.label);
      const onClick = () => {
        const first: SortDirection = column.initialSort ?? "asc";
        const second: SortDirection = first === "asc" ? "desc" : "asc";
        if (sortColumn !== index) {
          sortColumn = index;
          sortDirection = first;
        } else if (sortDirection === first) {
          sortDirection = second;
        } else if (sortDirection === second) {
          sortColumn = -1;
          sortDirection = "none";
        } else {
          sortDirection = first;
        }
        syncSortHeaders();
        if (sortDirection === "asc" && column.sortAscLabel) button.title = column.sortAscLabel;
        else if (sortDirection === "desc" && column.sortDescLabel) button.title = column.sortDescLabel;
        else button.removeAttribute("title");
        options.onSort?.(index, sortDirection);
      };
      button.addEventListener("click", onClick);
      cleanups.push(() => button.removeEventListener("click", onClick));
      th.append(button);
    } else {
      th.textContent = column.label;
    }

    headerCells.push(th);
    headerRow.append(th);
  });

  thead.append(headerRow);
  table.append(thead, tbody);

  const wrapAttrs: Record<string, string> = {};
  if (options.ariaLabel) {
    wrapAttrs.role = "region";
    wrapAttrs["aria-label"] = options.ariaLabel;
    wrapAttrs.tabindex = "0";
  }
  const element = el("div", { className: "anyfile-inspector__table-wrap", attrs: wrapAttrs }, table);

  const renderRows = (
    rows: readonly DataTableRow[],
    overrides?: { readonly emptyMessage?: string; readonly note?: string },
  ) => {
    const emptyMessage = overrides?.emptyMessage ?? options.emptyMessage;
    const note = overrides?.note ?? options.note;
    const colSpan = Math.max(1, options.columns.length);

    if (rows.length === 0) {
      if (emptyMessage) {
        const cell = el("td", { className: "anyfile-inspector__empty", attrs: { colspan: String(colSpan) } }, emptyMessage);
        tbody.replaceChildren(el("tr", undefined, cell));
      } else {
        tbody.replaceChildren();
      }
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const spec = isRowObject(row) ? row : { cells: row };
      const rowClasses: string[] = [];
      if (spec.interactive) rowClasses.push("anyfile-inspector__row--interactive");
      if (spec.selected) rowClasses.push("anyfile-inspector__row--selected");
      if (spec.className) rowClasses.push(spec.className);
      const dataset = spec.selected !== undefined
        ? { ...spec.dataset, selected: String(spec.selected) }
        : spec.dataset;
      const tr = el("tr", { className: rowClasses.join(" ") || undefined, dataset });
      options.columns.forEach((column, colIndex) => {
        const value = spec.cells[colIndex];
        const cellChild: ElChild = value === undefined ? "" : value;
        tr.append(el("td", columnClasses(column, true) || undefined, cellChild));
      });
      fragment.append(tr);
    }
    if (note) {
      const noteCell = el("td", { className: "anyfile-inspector__note", attrs: { colspan: String(colSpan) } }, note);
      fragment.append(el("tr", undefined, noteCell));
    }
    tbody.replaceChildren(fragment);
  };

  if (options.rows !== undefined) {
    renderRows(options.rows);
  }

  return {
    element,
    table,
    thead,
    tbody,
    setRows: renderRows,
    getSort: () => ({ columnIndex: sortColumn, direction: sortDirection }),
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
