import initSqlJs from "sql.js";

import { formatValue } from "./format-value";
import type { DataSession } from "./types";

const MAX_SQLITE_BYTES = 256 * 1024 * 1024;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function readFileBytes(file: File, signal: AbortSignal) {
  if (file.size > MAX_SQLITE_BYTES) throw new RangeError("SQLite file exceeds the 256 MiB limit");
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

export async function createSQLiteSession(file: File, signal: AbortSignal): Promise<DataSession> {
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
    dataSets: tables.map((name) => ({ id: name, label: name })),
    async query(dataSetId, offset, limit) {
      if (disposed || signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
      if (!tables.includes(dataSetId)) throw new Error("Unknown SQLite table");
      const identifier = quoteIdentifier(dataSetId);
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
