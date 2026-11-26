import { DatabaseSync } from "node:sqlite";
import {
  AgentError,
  abortError,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type QueryParams,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

const SQLITE_MAGIC = "SQLite format 3\0";
const MAX_IN_MEMORY_BYTES = 64 * 1024 * 1024;
const encoder = new TextEncoder();

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`;
  return String(value).replaceAll("|", "\\|").replaceAll("\r\n", " ").replaceAll("\n", " ");
}

async function openReadOnlyDb(context: ExtractContext): Promise<DatabaseSync> {
  if (context.signal.aborted) throw abortError();
  const header = await context.source.read(0, 16, context.signal);
  if (header.byteLength < 16) {
    throw new AgentError("invalid-file", "File is too small to be a SQLite database.", { pluginId: "sqlite-database" });
  }
  const magic = new TextDecoder("ascii").decode(header);
  if (magic !== SQLITE_MAGIC) {
    throw new AgentError("invalid-file", "File does not start with the SQLite 3 magic header.", { pluginId: "sqlite-database" });
  }

  let db: DatabaseSync;
  try {
    if (context.source.filePath) {
      db = new DatabaseSync(context.source.filePath, {
        readOnly: true,
        allowExtension: false,
      });
    } else {
      if (context.source.size > MAX_IN_MEMORY_BYTES) {
        throw new AgentError("resource-limit", "In-memory SQLite buffer exceeds size limit.", { pluginId: "sqlite-database" });
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
      { pluginId: "sqlite-database", cause: error },
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

function parseRowCursor(cursor?: string): number {
  if (!cursor) return 0;
  const match = /^row:(\d+)$/.exec(cursor);
  if (!match) {
    throw new AgentError("target-not-found", `Invalid pagination cursor: "${cursor}".`, { pluginId: "sqlite-database" });
  }
  return Number(match[1]);
}

function formatMarkdownTable(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  startOffset: number,
  maxBytes: number,
  totalKnownMore: boolean,
): ReadResult {
  const headerLine = `| ${columns.map(escapeCell).join(" | ")} |`;
  const sepLine = `| ${columns.map(() => "---").join(" | ")} |`;
  const prefix = `${headerLine}\n${sepLine}`;
  const prefixBytes = encoder.encode(prefix).byteLength;

  if (prefixBytes > maxBytes) {
    // Even header exceeds tiny budget: fall back to compact header slice
    const encoded = encoder.encode(prefix);
    let cut = maxBytes;
    while (cut > 0 && (encoded[cut] & 0xc0) === 0x80) cut -= 1;
    return {
      content: new TextDecoder("utf-8").decode(encoded.subarray(0, cut)),
      contentType: "markdown",
      truncated: true,
    };
  }

  const lines = [headerLine, sepLine];
  let usedBytes = prefixBytes;
  let included = 0;

  for (const row of rows) {
    const line = `| ${columns.map((col) => escapeCell(row[col])).join(" | ")} |`;
    const lineBytes = encoder.encode(`\n${line}`).byteLength;
    if (usedBytes + lineBytes > maxBytes) {
      break;
    }
    lines.push(line);
    usedBytes += lineBytes;
    included += 1;
  }

  const hasMore = included < rows.length || totalKnownMore;
  const nextOffset = startOffset + included;
  return {
    content: lines.join("\n"),
    contentType: "markdown",
    ...(hasMore && included > 0 ? { nextCursor: `row:${nextOffset}` } : {}),
    truncated: hasMore,
  };
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
    throw new AgentError("invalid-file", "SQL query cannot be empty.", { pluginId: "sqlite-database" });
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
        pluginId: "sqlite-database",
      });
    }
  }

  const body = stripLeadingSqlComments(trimmed);
  const firstWord = /^([A-Za-z]+)/.exec(body)?.[1]?.toUpperCase() ?? "";
  if (firstWord === "PRAGMA") {
    if (body.includes("=")) {
      throw new AgentError("unsupported-capability", "Write PRAGMA statements are not allowed.", {
        pluginId: "sqlite-database",
      });
    }
    return trimmed;
  }
  if (!["SELECT", "WITH", "EXPLAIN", "VALUES"].includes(firstWord)) {
    throw new AgentError(
      "unsupported-capability",
      `Only read-only SQL queries are permitted (rejected "${firstWord || "unknown"}").`,
      { pluginId: "sqlite-database" },
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
        let rowCount = 0;
        try {
          const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${quoteIdent(table.name)}`).get() as
            | { cnt?: number }
            | undefined;
          rowCount = Number(row?.cnt ?? 0);
        } catch {
          rowCount = 0;
        }
        const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table.name)})`).all() as {
          name: string;
          type: string;
        }[];
        targets.push({
          id: `table:${table.name}`,
          title: table.name,
          kind: table.type,
          size: rowCount,
        });
        tableMeta.push({
          name: table.name,
          type: table.type,
          rows: rowCount,
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
        const encoded = encoder.encode(schemaMd);
        if (encoded.byteLength <= params.maxBytes) {
          return { content: schemaMd, contentType: "markdown", truncated: false };
        }
        let cut = params.maxBytes;
        while (cut > 0 && (encoded[cut] & 0xc0) === 0x80) cut -= 1;
        return {
          content: new TextDecoder("utf-8").decode(encoded.subarray(0, cut)),
          contentType: "markdown",
          truncated: true,
        };
      }

      if (!target.startsWith("table:")) {
        throw new AgentError("target-not-found", `Unknown SQLite target: "${target}".`, { pluginId: "sqlite-database" });
      }
      const tableName = target.slice(6);
      if (!tables.some((t) => t.name === tableName)) {
        throw new AgentError("target-not-found", `SQLite table not found: "${tableName}".`, { pluginId: "sqlite-database" });
      }

      const offset = parseRowCursor(params.cursor);
      const pageLimit = 200;
      const ident = quoteIdent(tableName);
      const colInfo = db.prepare(`PRAGMA table_info(${ident})`).all() as { name: string }[];
      const columns = colInfo.map((c) => String(c.name));

      const rawRows = db
        .prepare(`SELECT * FROM ${ident} LIMIT ? OFFSET ?`)
        .all(pageLimit + 1, offset) as Record<string, unknown>[];
      const hasMoreInDb = rawRows.length > pageLimit;
      let rows = rawRows.slice(0, pageLimit);

      let filterApplied: boolean | undefined;
      if (params.filter && params.filter.trim().length > 0) {
        const needle = params.filter.toLowerCase();
        rows = rows.filter((row) =>
          columns.some((col) => escapeCell(row[col]).toLowerCase().includes(needle)),
        );
        filterApplied = true;
      }

      const result = formatMarkdownTable(columns, rows, offset, params.maxBytes, hasMoreInDb);
      return filterApplied !== undefined ? { ...result, filterApplied } : result;
    } finally {
      db.close();
    }
  },

  async query(context: ExtractContext, params: QueryParams): Promise<ReadResult> {
    const sql = assertReadOnlySql(params.sql);
    const db = await openReadOnlyDb(context);
    try {
      const offset = parseRowCursor(params.cursor);
      let allRows: Record<string, unknown>[];
      try {
        allRows = db.prepare(sql).all() as Record<string, unknown>[];
      } catch (error) {
        throw new AgentError(
          "invalid-file",
          error instanceof Error ? error.message : "SQL query execution failed.",
          { pluginId: "sqlite-database", cause: error },
        );
      }

      if (allRows.length === 0) {
        return { content: "(0 rows)", contentType: "markdown", truncated: false };
      }

      const columns = Object.keys(allRows[0]);
      const sliced = allRows.slice(offset);
      return formatMarkdownTable(columns, sliced, offset, params.maxBytes, false);
    } finally {
      db.close();
    }
  },
};

export default sqliteExtractor;
