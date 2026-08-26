import initSqlJs from "sql.js";

const MAX_FILE_BYTES = 256 * 1024 * 1024;

export type SQLitePage = {
  readonly columns: readonly { name: string; type: string }[];
  readonly rows: readonly (readonly string[])[];
  readonly hasMore: boolean;
};

export interface SQLiteSession {
  readonly tables: readonly string[];
  query(table: string, offset: number, limit: number): Promise<SQLitePage>;
  dispose(): Promise<void>;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Uint8Array) {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return String(value);
}

async function readFileBytes(file: File, signal: AbortSignal) {
  if (file.size > MAX_FILE_BYTES) throw new RangeError("SQLite file exceeds the 256 MiB limit");
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      byteLength += value.byteLength;
    }
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export async function createSQLiteSession(file: File, signal: AbortSignal): Promise<SQLiteSession> {
  const SQL = await initSqlJs({
    locateFile: () => new URL("sql.js/dist/sql-wasm.wasm", import.meta.url).toString(),
  });
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  const database = new SQL.Database(await readFileBytes(file, signal));
  let disposed = false;
  const tables = database.exec(`
    SELECT name
    FROM sqlite_master
    WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)[0]?.values.map(([name]) => String(name)) ?? [];
  if (tables.length === 0) {
    database.close();
    throw new Error("The SQLite database contains no tables");
  }

  return {
    tables,
    async query(table, offset, limit) {
      if (disposed || signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
      if (!tables.includes(table)) throw new Error("Unknown SQLite table");
      const identifier = quoteIdentifier(table);
      const typeRows = database.exec(`PRAGMA table_info(${identifier})`)[0]?.values ?? [];
      const result = database.exec(
        `SELECT * FROM ${identifier} LIMIT ${limit + 1} OFFSET ${offset}`,
      )[0];
      const rows = result?.values ?? [];
      return {
        columns: (result?.columns ?? typeRows.map((row) => String(row[1]))).map((name, index) => ({
          name,
          type: String(typeRows[index]?.[2] || "UNKNOWN"),
        })),
        rows: rows.slice(0, limit).map((row) => row.map(formatValue)),
        hasMore: rows.length > limit,
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      database.close();
    },
  };
}
