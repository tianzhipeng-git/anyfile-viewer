import {
  AgentError,
  abortError,
  paginateText,
  parsePositionCursor,
  renderMarkdownTablePage,
  type JsonValue,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

import { PLUGIN_ID, assertReadOnlySql, engineError, withSession, type Connection, type Session } from "./extract-engine";

/** Source rows scanned per filtered page before handing back a cursor. */
const FILTER_SCAN_ROWS = 10_000;

type Cells = (string | null)[];

function toCells(row: { toJSON(): Record<string, unknown> }): Cells {
  return Object.values(row.toJSON()).map((value) => (value === null || value === undefined ? null : String(value)));
}

function tableColumns(connection: Connection, sql: string): string[] {
  return connection.query(`SELECT column_name, column_type FROM (DESCRIBE ${sql})`).toArray().map((row) => {
    const [name, type] = toCells(row);
    return `${name}:${type}`;
  });
}

function findTable(tables: Session["tables"], target: string) {
  const table = tables.find(({ id }) => id === target);
  if (!table) throw new AgentError("target-not-found", `DuckDB target not found: "${target}".`, { pluginId: PLUGIN_ID });
  return table;
}

const duckdbExtractor: StructuredExtractor = {
  inspect(context) {
    return withSession(context, ({ kind, connection, tables }) => {
      const meta: JsonValue[] = [];
      const targets: TargetEntry[] = kind === "database" ? [{ id: "schema", title: "Database Schema", kind: "entry", size: tables.length }] : [];
      for (const table of tables) {
        if (context.signal.aborted) throw abortError();
        // Views may be arbitrarily expensive; only base tables are counted.
        const rows = table.kind === "table" ? Number(toCells(connection.query(`SELECT count(*) FROM ${table.sql}`).get(0)!)[0]) : undefined;
        targets.push({ id: table.id, title: table.title, kind: table.kind, ...(rows !== undefined ? { size: rows } : {}) });
        meta.push({ name: table.title, type: table.kind, rows: rows ?? null, columns: tableColumns(connection, table.sql) });
      }
      return { metadata: { format: kind, sizeBytes: context.source.size, tableCount: tables.length, tables: meta }, targets };
    });
  },

  read(context, params) {
    return withSession(context, ({ connection, tables }) => {
      const target = params.target ?? tables[0]?.id ?? "schema";
      if (target === "schema" && tables.every(({ id }) => id !== "schema")) {
        const ddl = tables.map((t) => `## ${t.title} (${t.kind})\n\n\`\`\`sql\n${t.ddl}\n\`\`\``).join("\n\n");
        const result = paginateText(ddl, params.cursor, params.maxBytes, "markdown", PLUGIN_ID);
        return params.filter?.trim() ? { ...result, filterApplied: false } : result;
      }
      const table = findTable(tables, target);
      const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
      const page = connection.query(`SELECT COLUMNS(*)::VARCHAR FROM ${table.sql} LIMIT ${FILTER_SCAN_ROWS + 1} OFFSET ${start}`);
      const needle = params.filter?.trim().toLowerCase();
      const source = page.toArray().map(toCells);
      const result = renderMarkdownTablePage({
        columns: page.schema.fields.map(({ name }) => name),
        rows: source
          .slice(0, FILTER_SCAN_ROWS)
          .map((cells) => (!needle || cells.some((cell) => cell?.toLowerCase().includes(needle)) ? cells : null)),
        start,
        maxBytes: params.maxBytes,
        cursorPrefix: "row:",
        hasMoreAfter: () => source.length > FILTER_SCAN_ROWS,
      });
      return needle ? { ...result, filterApplied: true } : result;
    });
  },

  query(context, params) {
    if (context.signal.aborted) return Promise.reject(abortError());
    let checked: ReturnType<typeof assertReadOnlySql>;
    try {
      checked = assertReadOnlySql(params.sql);
    } catch (error) {
      return Promise.reject(error);
    }
    return withSession(context, async ({ connection }): Promise<ReadResult> => {
      const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
      // Casting every column to VARCHAR renders dates, decimals and nested values the way DuckDB prints them.
      const sql = checked.firstWord === "EXPLAIN" ? checked.sql : `SELECT COLUMNS(*)::VARCHAR FROM (${checked.sql})`;
      let reader: Awaited<ReturnType<Connection["send"]>>;
      try {
        reader = (await connection.send(sql)).open();
      } catch (error) {
        engineError(error, "invalid-argument");
      }
      const columns = reader.schema.fields.map(({ name }) => name);
      if (columns.length === 0) return { content: "(statement returned no columns)", contentType: "markdown", truncated: false };
      function* rows() {
        let index = 0;
        try {
          for (const batch of reader) {
            if (context.signal.aborted) throw abortError();
            for (const row of batch) {
              if (index++ >= start) yield toCells(row);
            }
          }
        } catch (error) {
          engineError(error, "invalid-argument");
        }
      }
      return renderMarkdownTablePage({ columns, rows: rows(), start, maxBytes: params.maxBytes, cursorPrefix: "row:" });
    });
  },
};

export default duckdbExtractor;
