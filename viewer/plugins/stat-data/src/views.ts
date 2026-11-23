import type { TableViewerOption, TableViewerPage } from "@anyfile/viewer-ui";
import { createValueFormatter } from "./format-value";
import type { Copy } from "./messages";
import type { StatFormat, StatSchema, StatValue } from "./types";

export const PAGE_SIZE = 100;
export const COLUMN_WINDOW = 100;
type Rows = (offset: number, limit: number, firstColumn: number, lastColumn: number) => Promise<StatValue[][]>;

/** Builds the selectable views (data column windows, variables, value labels, file info) over one schema. */
export function createStatViews(format: StatFormat, schema: StatSchema, copy: Copy, readRows: Rows) {
  const formatter = createValueFormatter(format, schema);
  const { variables, meta } = schema;
  const windows = Math.ceil(variables.length / COLUMN_WINDOW);
  const options: TableViewerOption[] = [];
  for (let index = 0; index < windows; index++) {
    const first = index * COLUMN_WINDOW;
    options.push({ id: `data:${index}`, label: windows === 1 ? copy.data : copy.dataColumns(first + 1, Math.min(first + COLUMN_WINDOW, variables.length)) });
  }
  options.push({ id: "variables", label: copy.variables(variables.length) });
  const labelRows = schema.labels.flatMap((set) => set.values.map(([value, label]) => [set.name, formatter.plain(value), label]));
  if (labelRows.length) options.push({ id: "labels", label: copy.labels });
  options.push({ id: "info", label: copy.info });

  const h = copy.headers;
  const spss = format === "sav" || format === "por";
  // SAS names a variable's format catalog here even when no labels are present; show only sets that exist.
  const labelSets = new Set(schema.labels.map(({ name }) => name));
  const variableRows = variables.map((variable) => [
    variable.name, variable.label, `${variable.string ? copy.string : copy.numeric} (${variable.storage})`, variable.format, labelSets.has(variable.labels) ? variable.labels : "",
    variable.missing.map(([low, high]) => formatter.plain(low) === formatter.plain(high) ? formatter.plain(low) : `${formatter.plain(low)} – ${formatter.plain(high)}`).join(", "),
    ...(spss ? [copy.measures[variable.measure] ?? ""] : []),
  ]);
  const date = (seconds: number) => seconds > 0 ? new Date(seconds * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC") : "";
  const p = copy.properties;
  const infoRows = ([
    [p.format, copy.formats[format]], [p.version, meta.version > 0 ? String(meta.version) : ""],
    [p.rows, meta.rows >= 0 ? String(meta.rows) : copy.unknown], [p.variables, String(variables.length)],
    [p.encoding, meta.encoding], [p.created, date(meta.created)], [p.modified, date(meta.modified)],
    [p.compression, format === "sav" ? copy.compression[meta.compression] ?? "" : ""], [p.fileLabel, meta.label], [p.table, meta.table],
    ...schema.notes.map((note) => [p.note, note]), ...(schema.incomplete ? [[p.warning, copy.incomplete]] : []),
  ] as string[][]).filter(([, value]) => value);

  const staticPage = (columns: string[], rows: string[][], pageIndex: number): TableViewerPage => {
    const offset = pageIndex * PAGE_SIZE;
    const slice = rows.slice(offset, offset + PAGE_SIZE);
    return { columns: columns.map((label) => ({ label })), rows: slice, rowOffset: offset, hasMore: offset + PAGE_SIZE < rows.length, meta: slice.length ? copy.items(offset + 1, offset + slice.length, rows.length) : "", emptyMessage: copy.empty };
  };

  async function loadPage(id: string, pageIndex: number): Promise<TableViewerPage> {
    if (id === "variables") return staticPage([h.name, h.label, h.type, h.format, h.valueLabels, h.missing, ...(spss ? [h.measure] : [])], variableRows, pageIndex);
    if (id === "labels") return staticPage([h.set, h.value, h.label], labelRows, pageIndex);
    if (id === "info") return staticPage([h.property, h.value], infoRows, pageIndex);
    const first = Number(id.slice(5)) * COLUMN_WINDOW;
    const columns = variables.slice(first, first + COLUMN_WINDOW);
    const offset = pageIndex * PAGE_SIZE;
    const known = meta.rows >= 0;
    const rows = known && offset >= meta.rows ? [] : await readRows(offset, known ? PAGE_SIZE : PAGE_SIZE + 1, first, first + columns.length);
    const hasMore = known ? offset + PAGE_SIZE < meta.rows : rows.length > PAGE_SIZE;
    const shown = rows.slice(0, PAGE_SIZE);
    const range = shown.length ? copy.rows(offset + 1, offset + shown.length, meta.rows, hasMore) : "";
    return {
      columns: columns.map((variable) => ({ label: variable.name, type: variable.format || undefined })),
      rows: shown.map((row) => columns.map((variable, index) => formatter.cell(variable, row[index] ?? null))),
      rowOffset: offset,
      hasMore,
      meta: schema.incomplete && range ? `${range} · ${copy.incomplete}` : range,
      emptyMessage: copy.empty,
    };
  }
  return { options, loadPage };
}
