import { fileURLToPath } from "node:url";
import * as duckdb from "@duckdb/duckdb-wasm/blocking";
import { AgentError, abortError, isViewerAbortError, type ExtractContext } from "@anyfile/viewer-protocol";

import { findDataFileFormat, type DataFileKind } from "./formats";

export const PLUGIN_ID = "duckdb-data";
/** Vendor path of the same DuckDB-Wasm build the Web viewer serves from `/vendor/`. */
const VENDOR_DIR = "duckdb/1.32.0/";
/** Files are copied into the engine (BUFFER protocol); DuckDB-Wasm's NODE_FS opens files read-write. */
const MAX_IN_MEMORY_BYTES = 128 * 1024 * 1024;
const DUCKDB_MAGIC = "DUCK";

type Database = Awaited<ReturnType<typeof duckdb.createDuckDB>>;
export type Connection = ReturnType<Database["connect"]>;

export type SourceTable = {
  /** Target id. */
  readonly id: string;
  readonly title: string;
  readonly kind: "table" | "view";
  /** Fully quoted SQL reference. */
  readonly sql: string;
  readonly ddl: string;
};

export type Session = {
  readonly kind: DataFileKind;
  readonly connection: Connection;
  readonly tables: readonly SourceTable[];
};

let runtime: Promise<Database> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function loadRuntime(context: ExtractContext): Promise<Database> {
  runtime ??= (async () => {
    // Node always supports Wasm exceptions, so the EH build is the only one ever selected.
    const eh = fileURLToPath(await context.vendor.url(`${VENDOR_DIR}duckdb-eh.wasm`));
    const db = await duckdb.createDuckDB(
      { mvp: { mainModule: eh, mainWorker: "" }, eh: { mainModule: eh, mainWorker: "" } },
      new duckdb.VoidLogger(),
      duckdb.NODE_RUNTIME,
    );
    await db.instantiate();
    return db;
  })().catch((error: unknown) => {
    runtime = undefined;
    throw new AgentError("runtime-unavailable", `DuckDB runtime failed to load: ${message(error)}`, {
      pluginId: PLUGIN_ID,
      cause: error,
    });
  });
  return runtime;
}

export const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
export const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
const quoteString = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Maps a DuckDB error to a standard code; missing extensions cannot be fetched offline. */
export function engineError(error: unknown, fallback: "invalid-file" | "invalid-argument"): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  const text = message(error);
  const code = /extension/i.test(text)
    ? "runtime-unavailable"
    : /read-only mode|Permission Error|disabled by configuration|configuration has been locked/i.test(text)
      ? "unsupported-capability"
      : fallback;
  const firstLine = text.split("\n")[0];
  const detail = code === "runtime-unavailable" ? `DuckDB extension is not available offline. ${firstLine}` : firstLine;
  throw new AgentError(code, detail, { pluginId: PLUGIN_ID, cause: error });
}

function textRows(connection: Connection, sql: string): string[][] {
  return connection.query(sql).toArray().map((row) => Object.values(row.toJSON()).map((value) => String(value ?? "")));
}

function loadSource(db: Database, connection: Connection, kind: DataFileKind, bytes: Uint8Array): void {
  if (kind === "arrow") {
    connection.insertArrowFromIPCStream(bytes, { name: "data", create: true });
    // Unparseable IPC bytes insert nothing instead of throwing.
    connection.query("SELECT 1 FROM data LIMIT 0");
    return;
  }
  const file = `source${kind === "database" ? ".duckdb" : `.${kind}`}`;
  db.registerFileBuffer(file, bytes);
  if (kind === "database") {
    connection.query(`ATTACH ${quoteString(file)} AS source (READ_ONLY)`);
    connection.query("USE source");
    return;
  }
  const reader = {
    csv: `read_csv_auto(${quoteString(file)}, header=true)`,
    tsv: `read_csv_auto(${quoteString(file)}, header=true, delim='\\t')`,
    json: `read_json_auto(${quoteString(file)})`,
    parquet: `read_parquet(${quoteString(file)})`,
  }[kind];
  // Single-file formats are materialized so the query phase never needs file system access.
  connection.query(`CREATE TABLE data AS SELECT * FROM ${reader}`);
  db.dropFile(file);
}

function listTables(connection: Connection, kind: DataFileKind, title: string): SourceTable[] {
  if (kind !== "database") {
    return [{ id: "table:data", title, kind: "table", sql: "data", ddl: "" }];
  }
  return textRows(
    connection,
    `SELECT schema_name, table_name, 'table', sql FROM duckdb_tables() WHERE database_name = 'source'
     UNION ALL
     SELECT schema_name, view_name, 'view', sql FROM duckdb_views() WHERE database_name = 'source' AND NOT internal
     ORDER BY 1, 2`,
  ).map(([schema, name, type, ddl]) => {
    const label = schema === "main" ? name : `${schema}.${name}`;
    return {
      id: `table:${label}`,
      title: label,
      kind: type as "table" | "view",
      sql: `${quoteIdent(schema)}.${quoteIdent(name)}`,
      ddl,
    };
  });
}

async function openSession(db: Database, context: ExtractContext): Promise<Session> {
  const match = findDataFileFormat(context.source.name);
  if (!match) throw new AgentError("invalid-file", "Unsupported DuckDB data file extension.", { pluginId: PLUGIN_ID });
  const kind = match.format.kind;
  if (context.source.size > MAX_IN_MEMORY_BYTES) {
    throw new AgentError("resource-limit", "File exceeds the 128 MiB DuckDB extraction limit.", { pluginId: PLUGIN_ID });
  }
  const bytes = await context.source.read(0, context.source.size, context.signal);
  if (kind === "database" && new TextDecoder("ascii").decode(bytes.subarray(8, 12)) !== DUCKDB_MAGIC) {
    throw new AgentError("invalid-file", "File does not carry the DuckDB magic header.", { pluginId: PLUGIN_ID });
  }
  if (context.signal.aborted) throw abortError();

  db.reset();
  db.dropFiles();
  const connection = db.connect();
  try {
    // Never auto-install extensions (network + writes to ~/.duckdb) or spill to disk.
    for (const statement of ["autoinstall_known_extensions=false", "autoload_known_extensions=false", "temp_directory=''"]) {
      connection.query(`SET ${statement}`);
    }
    try {
      loadSource(db, connection, kind, bytes);
    } catch (error) {
      engineError(error, "invalid-file");
    }
    // Lock the sandbox: no file/network access and no way to re-enable it from SQL.
    connection.query("SET enable_external_access=false");
    connection.query("SET lock_configuration=true");
    return { kind, connection, tables: listTables(connection, kind, context.source.name) };
  } catch (error) {
    connection.close();
    throw error;
  }
}

/** Runs `work` against a fresh, read-only, sandboxed DuckDB session; calls are serialized per worker. */
export function withSession<T>(context: ExtractContext, work: (session: Session) => T | Promise<T>): Promise<T> {
  const run = async () => {
    if (context.signal.aborted) throw abortError();
    const db = await loadRuntime(context);
    if (context.signal.aborted) throw abortError();
    const session = await openSession(db, context);
    try {
      return await work(session);
    } catch (error) {
      engineError(error, "invalid-file");
    } finally {
      // An attached buffer stays pinned until the next session's `reset()` closes it.
      session.connection.close();
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Strips comments and quoted literals (single, double, dollar-quoted) and rejects statement batches. */
function codeOnly(sql: string): string {
  const stripped = sql.replace(
    /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*(?:'|$)|"(?:[^"]|"")*(?:"|$)|\$([A-Za-z_]\w*)?\$[\s\S]*?(?:\$\1\$|$)/g,
    " ",
  );
  if (stripped.includes(";")) {
    throw new AgentError("unsupported-capability", "Multiple SQL statements are not allowed.", { pluginId: PLUGIN_ID });
  }
  return stripped.trim();
}

const READ_ONLY_FIRST_WORDS = new Set(["SELECT", "WITH", "FROM", "VALUES", "DESCRIBE", "SHOW", "SUMMARIZE", "EXPLAIN"]);
const WRITE_SQL_PATTERN =
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|DROP|ALTER|ATTACH|DETACH|COPY|EXPORT|IMPORT|INSTALL|LOAD|SET|RESET|PRAGMA|CALL|CHECKPOINT|VACUUM)\b/i;

/** Returns the statement without trailing semicolons, or throws for anything but a single read-only query. */
export function assertReadOnlySql(rawSql: string): { readonly sql: string; readonly firstWord: string } {
  const sql = rawSql.trim().replace(/;+\s*$/, "");
  if (!sql) throw new AgentError("invalid-argument", "SQL query cannot be empty.", { pluginId: PLUGIN_ID });
  const code = codeOnly(sql);
  const firstWord = /^\(*\s*([A-Za-z]+)/.exec(code)?.[1]?.toUpperCase() ?? "";
  if (!READ_ONLY_FIRST_WORDS.has(firstWord) || WRITE_SQL_PATTERN.test(code)) {
    throw new AgentError("unsupported-capability", `Only read-only SQL queries are permitted (rejected "${firstWord || "unknown"}").`, {
      pluginId: PLUGIN_ID,
    });
  }
  return { sql, firstWord };
}
