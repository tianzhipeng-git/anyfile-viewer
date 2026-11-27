import { DatabaseSync, type StatementSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  AgentError,
  abortError,
  isViewerAbortError,
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

const ARG_READ_ONLY_PRAGMAS = new Set([
  "table_info",
  "table_xinfo",
  "table_list",
  "index_list",
  "index_info",
  "index_xinfo",
  "foreign_key_list",
]);

const NO_ARG_READ_ONLY_PRAGMAS = new Set([
  "database_list",
  "collation_list",
  "compile_options",
  "function_list",
  "module_list",
  "pragma_list",
  "encoding",
  "page_size",
  "page_count",
  "freelist_count",
  "schema_version",
  "user_version",
  "application_id",
  "journal_mode",
  "data_version",
]);

const WRITE_SQL_PATTERN =
  /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|DETACH|VACUUM|REINDEX)\b|\bREPLACE\s+INTO\b/i;

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

  let db: DatabaseSync | undefined;
  try {
    if (context.source.filePath) {
      // immutable=1: no locks, no -wal/-shm files, never writes next to the user's file.
      const url = pathToFileURL(context.source.filePath);
      url.searchParams.set("immutable", "1");
      db = new DatabaseSync(url, { readOnly: true, allowExtension: false, readBigInts: true });
    } else {
      if (context.source.size > MAX_IN_MEMORY_BYTES) {
        throw new AgentError("resource-limit", "In-memory SQLite buffer exceeds size limit.", { pluginId: PLUGIN_ID });
      }
      const bytes = await context.source.read(0, context.source.size, context.signal);
      db = new DatabaseSync(":memory:", { allowExtension: false, readBigInts: true });
      db.deserialize(bytes);
    }
    db.exec("PRAGMA query_only = ON");
  } catch (error) {
    try {
      db?.close();
    } catch {
      // Ignore close errors while handling an initialization failure.
    }
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

/**
 * Strips SQL comments and string/identifier literal bodies into spaces while
 * rejecting multi-statement batches (semicolons outside literals/comments).
 */
function sanitizeSqlForInspection(sql: string): string {
  let out = "";
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      const nl = sql.indexOf("\n", i + 2);
      out += " ";
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      out += " ";
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      out += " ";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "[") {
      const end = sql.indexOf("]", i + 1);
      out += " ";
      if (end === -1) break;
      i = end;
      continue;
    }
    if (ch === ";") {
      throw new AgentError("unsupported-capability", "Multiple SQL statements are not allowed.", {
        pluginId: PLUGIN_ID,
      });
    }
    out += ch;
  }
  return out.trim();
}

function assertReadOnlySql(rawSql: string): string {
  const trimmed = rawSql.trim().replace(/;+\s*$/, "");
  if (!trimmed) {
    throw new AgentError("invalid-argument", "SQL query cannot be empty.", { pluginId: PLUGIN_ID });
  }
  const codeOnly = sanitizeSqlForInspection(trimmed);
  const firstWord = /^([A-Za-z]+)/.exec(codeOnly)?.[1]?.toUpperCase() ?? "";
  if (firstWord === "PRAGMA") {
    const match = /^PRAGMA\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)([\s\S]*)$/i.exec(codeOnly);
    const pragmaName = match?.[1]?.toLowerCase() ?? "";
    const rest = match?.[2]?.trim() ?? "";
    if (rest.includes("=")) {
      throw new AgentError("unsupported-capability", "Write PRAGMA statements are not allowed.", {
        pluginId: PLUGIN_ID,
      });
    }
    if (NO_ARG_READ_ONLY_PRAGMAS.has(pragmaName) && rest === "") {
      return trimmed;
    }
    if (ARG_READ_ONLY_PRAGMAS.has(pragmaName) && (rest === "" || /^\([^()]*\)$/.test(rest))) {
      return trimmed;
    }
    throw new AgentError(
      "unsupported-capability",
      `PRAGMA "${pragmaName || "unknown"}" is not permitted in read-only mode.`,
      { pluginId: PLUGIN_ID },
    );
  }
  if (!["SELECT", "WITH", "EXPLAIN", "VALUES"].includes(firstWord)) {
    throw new AgentError(
      "unsupported-capability",
      `Only read-only SQL queries are permitted (rejected "${firstWord || "unknown"}").`,
      { pluginId: PLUGIN_ID },
    );
  }
  if (firstWord !== "EXPLAIN" && WRITE_SQL_PATTERN.test(codeOnly)) {
    throw new AgentError("unsupported-capability", "Write SQL statements are not allowed.", {
      pluginId: PLUGIN_ID,
    });
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
        const result = paginateText(schemaMd, params.cursor, params.maxBytes, "markdown", PLUGIN_ID);
        return params.filter?.trim() ? { ...result, filterApplied: false } : result;
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
      statement.setReturnArrays(true);
      const columns = statement.columns().map((column) => column.name);
      const needle = params.filter?.trim().toLowerCase();
      let scanned = 0;
      let sourceExhausted = false;
      function* rows() {
        for (const cells of statement.iterate(FILTER_SCAN_ROWS + 1, start) as Iterable<unknown[]>) {
          if (context.signal.aborted) throw abortError();
          if (scanned === FILTER_SCAN_ROWS) return;
          scanned += 1;
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
    if (context.signal.aborted) throw abortError();
    const sql = assertReadOnlySql(params.sql);
    const db = await openReadOnlyDb(context);
    try {
      const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
      let statement: StatementSync;
      try {
        statement = db.prepare(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid SQL query.";
        const code = /readonly|attempt to write|not authorized/i.test(message)
          ? "unsupported-capability"
          : "invalid-argument";
        throw new AgentError(code, message, { pluginId: PLUGIN_ID, cause: error });
      }
      statement.setReturnArrays(true);
      const columns = statement.columns().map((column) => column.name);
      function* rows() {
        let index = 0;
        try {
          for (const cells of statement.iterate() as Iterable<unknown[]>) {
            if (context.signal.aborted) throw abortError();
            if (index++ < start) continue;
            yield cells;
          }
        } catch (error) {
          if (isViewerAbortError(error)) throw error;
          const message = error instanceof Error ? error.message : "SQL query execution failed.";
          const code = /readonly|attempt to write|not authorized/i.test(message)
            ? "unsupported-capability"
            : "invalid-file";
          throw new AgentError(code, message, { pluginId: PLUGIN_ID, cause: error });
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
