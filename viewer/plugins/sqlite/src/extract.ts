import { DatabaseSync, type StatementSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  AgentError,
  abortError,
  paginateText,
  parsePositionCursor,
  renderMarkdownTablePage,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type QueryParams,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

const PLUGIN_ID = "sqlite-database";
const SQLITE_MAGIC = "SQLite format 3\0";
const MAX_IN_MEMORY_BYTES = 64 * 1024 * 1024;
/** Above this size `inspect` skips `COUNT(*)`, which is a full scan per table. */
const MAX_ROW_COUNT_BYTES = 256 * 1024 * 1024;
/** Source rows scanned per filtered page before handing back a cursor. */
const FILTER_SCAN_ROWS = 10_000;

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function openReadOnlyDb(context: ExtractContext): Promise<DatabaseSync> {
  if (context.signal.aborted) throw abortError();
  const header = await context.source.read(0, 16, context.signal);
  if (header.byteLength < 16) {
    throw new AgentError("invalid-file", "File is too small to be a SQLite database.", { pluginId: PLUGIN_ID });
  }
  const magic = new TextDecoder("ascii").decode(header);
  if (magic !== SQLITE_MAGIC) {
    throw new AgentError("invalid-file", "File does not start with the SQLite 3 magic header.", { pluginId: PLUGIN_ID });
  }

  let db: DatabaseSync;
  try {
    if (context.source.filePath) {
      // immutable=1: no locks, no -wal/-shm files, never writes next to the user's file.
      const url = pathToFileURL(context.source.filePath);
      url.searchParams.set("immutable", "1");
      db = new DatabaseSync(url, { readOnly: true, allowExtension: false });
    } else {
      if (context.source.size > MAX_IN_MEMORY_BYTES) {
        throw new AgentError("resource-limit", "In-memory SQLite buffer exceeds size limit.", { pluginId: PLUGIN_ID });
      }
      const bytes = await context.source.read(0, context.source.size, context.signal);
      db = new DatabaseSync(":memory:", { allowExtension: false });
      db.deserialize(bytes);
    }
    db.exec("PRAGMA query_only = ON");
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw new AgentError(
      "invalid-file",
      error instanceof Error ? error.message : "Failed to open SQLite database.",
      { pluginId: PLUGIN_ID, cause: error },
    );
  }
  return db;
}

function listTables(db: DatabaseSync): { readonly name: string; readonly type: string; readonly sql: string }[] {
  const rows = db
    .prepare(
      `SELECT name, type, sql FROM sqlite_master
       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string; type: string; sql: string | null }[];
  return rows.map((row) => ({
    name: String(row.name),
    type: String(row.type),
    sql: row.sql ? String(row.sql) : "",
  }));
}

function stripLeadingSqlComments(sql: string): string {
  let rest = sql.trimStart();
  while (true) {
    if (rest.startsWith("--")) {
      const nl = rest.indexOf("\n");
      rest = nl === -1 ? "" : rest.slice(nl + 1).trimStart();
    } else if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end === -1) return "";
      rest = rest.slice(end + 2).trimStart();
    } else {
      break;
    }
  }
  return rest;
}

function assertReadOnlySql(rawSql: string): string {
  const trimmed = rawSql.trim().replace(/;+\s*$/, "");
  if (!trimmed) {
    throw new AgentError("invalid-argument", "SQL query cannot be empty.", { pluginId: PLUGIN_ID });
  }
  // Reject multi-statement batches (semicolon outside quotes).
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ";" && !inSingle && !inDouble) {
      throw new AgentError("unsupported-capability", "Multiple SQL statements are not allowed.", {
        pluginId: PLUGIN_ID,
      });
    }
  }

  const body = stripLeadingSqlComments(trimmed);
  const firstWord = /^([A-Za-z]+)/.exec(body)?.[1]?.toUpperCase() ?? "";
  if (firstWord === "PRAGMA") {
    if (body.includes("=")) {
      throw new AgentError("unsupported-capability", "Write PRAGMA statements are not allowed.", {
        pluginId: PLUGIN_ID,
      });
    }
    return trimmed;
  }
  if (!["SELECT", "WITH", "EXPLAIN", "VALUES"].includes(firstWord)) {
    throw new AgentError(
      "unsupported-capability",
      `Only read-only SQL queries are permitted (rejected "${firstWord || "unknown"}").`,
      { pluginId: PLUGIN_ID },
    );
  }
  return trimmed;
}

const sqliteExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const db = await openReadOnlyDb(context);
    try {
      const tables = listTables(db);
      const targets: TargetEntry[] = [
        { id: "schema", title: "Database Schema", kind: "entry", size: tables.length },
      ];
      const tableMeta: JsonValue[] = [];

      for (const table of tables) {
        if (context.signal.aborted) throw abortError();
        let rowCount: number | undefined;
        if (context.source.size <= MAX_ROW_COUNT_BYTES) {
          try {
            const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${quoteIdent(table.name)}`).get() as { cnt?: number } | undefined;
            rowCount = Number(row?.cnt ?? 0);
          } catch {
            rowCount = undefined;
          }
        }
        const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table.name)})`).all() as {
          name: string;
          type: string;
        }[];
        targets.push({
          id: `table:${table.name}`,
          title: table.name,
          kind: table.type,
          ...(rowCount !== undefined ? { size: rowCount } : {}),
        });
        tableMeta.push({
          name: table.name,
          type: table.type,
          rows: rowCount ?? null,
          columns: cols.map((c) => `${c.name}:${c.type || "ANY"}`),
        });
      }

      return {
        metadata: {
          sizeBytes: context.source.size,
          tableCount: tables.length,
          tables: tableMeta,
        },
        targets,
      };
    } finally {
      db.close();
    }
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const db = await openReadOnlyDb(context);
    try {
      const tables = listTables(db);
      const defaultTarget = tables[0] ? `table:${tables[0].name}` : "schema";
      const target = params.target ?? defaultTarget;

      if (target === "schema") {
        const schemaMd = tables.map((t) => `## ${t.name} (${t.type})\n\n\`\`\`sql\n${t.sql};\n\`\`\``).join("\n\n");
        return paginateText(schemaMd, params.cursor, params.maxBytes, "markdown", PLUGIN_ID);
      }

      if (!target.startsWith("table:")) {
        throw new AgentError("target-not-found", `Unknown SQLite target: "${target}".`, { pluginId: PLUGIN_ID });
      }
      const tableName = target.slice(6);
      if (!tables.some((t) => t.name === tableName)) {
        throw new AgentError("target-not-found", `SQLite table not found: "${tableName}".`, { pluginId: PLUGIN_ID });
      }

      const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
      const statement = db.prepare(`SELECT * FROM ${quoteIdent(tableName)} LIMIT ? OFFSET ?`);
      const columns = statement.columns().map((column) => column.name);
      const needle = params.filter?.trim().toLowerCase();
      let scanned = 0;
      let sourceExhausted = false;
      function* rows() {
        for (const row of statement.iterate(FILTER_SCAN_ROWS + 1, start) as Iterable<Record<string, unknown>>) {
          if (scanned === FILTER_SCAN_ROWS) return;
          scanned += 1;
          const cells = columns.map((column) => row[column]);
          yield !needle || cells.some((cell) => String(cell ?? "").toLowerCase().includes(needle)) ? cells : null;
        }
        sourceExhausted = true;
      }
      const result = renderMarkdownTablePage({
        columns,
        rows: rows(),
        start,
        maxBytes: params.maxBytes,
        cursorPrefix: "row:",
        hasMoreAfter: () => !sourceExhausted,
      });
      return needle ? { ...result, filterApplied: true } : result;
    } finally {
      db.close();
    }
  },

  async query(context: ExtractContext, params: QueryParams): Promise<ReadResult> {
    const sql = assertReadOnlySql(params.sql);
    const db = await openReadOnlyDb(context);
    try {
      const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
      let statement: StatementSync;
      try {
        statement = db.prepare(sql);
      } catch (error) {
        throw new AgentError("invalid-argument", error instanceof Error ? error.message : "Invalid SQL query.", {
          pluginId: PLUGIN_ID,
          cause: error,
        });
      }
      const columns = statement.columns().map((column) => column.name);
      function* rows() {
        let index = 0;
        try {
          for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
            if (index++ < start) continue;
            yield columns.map((column) => row[column]);
          }
        } catch (error) {
          throw new AgentError("invalid-file", error instanceof Error ? error.message : "SQL query execution failed.", {
            pluginId: PLUGIN_ID,
            cause: error,
          });
        }
      }
      if (columns.length === 0) {
        return { content: "(statement returned no columns)", contentType: "markdown", truncated: false };
      }
      return renderMarkdownTablePage({ columns, rows: rows(), start, maxBytes: params.maxBytes, cursorPrefix: "row:" });
    } finally {
      db.close();
    }
  },
};

export default sqliteExtractor;
