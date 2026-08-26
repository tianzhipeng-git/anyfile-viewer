import * as duckdb from "@duckdb/duckdb-wasm";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { RecordBatchReader, Table } from "apache-arrow";

import { formatValue } from "./format-value";
import { findDataFileFormat, type DataFileKind } from "./formats";
import type { DataPage, DataSession, DataSet } from "./types";

const SOURCE_NAME = "source";
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm", import.meta.url).toString(),
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js", import.meta.url).toString(),
  },
  eh: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm", import.meta.url).toString(),
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js", import.meta.url).toString(),
  },
};

type QuerySource = DataSet & { readonly sql: string };

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function fileSource(kind: DataFileKind, path: string): QuerySource {
  switch (kind) {
    case "csv":
      return { id: "source", label: "CSV 数据", sql: `read_csv_auto('${path}', header=true)` };
    case "tsv":
      return { id: "source", label: "TSV 数据", sql: `read_csv_auto('${path}', header=true, delim='\\t')` };
    case "json":
      return { id: "source", label: "JSON 数据", sql: `read_json_auto('${path}')` };
    case "parquet":
      return { id: "source", label: "Parquet 数据", sql: `read_parquet('${path}')` };
    default:
      throw new Error("Unsupported data file extension");
  }
}

async function importArrow(
  connection: AsyncDuckDBConnection,
  file: File,
  signal: AbortSignal,
): Promise<QuerySource> {
  const reader = await RecordBatchReader.from(file.stream());
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  let created = false;
  try {
    for await (const batch of reader) {
      if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
      await connection.insertArrowTable(new Table(batch), {
        name: "arrow_data",
        create: !created,
      });
      created = true;
    }
    if (!created) {
      await connection.insertArrowTable(new Table(reader.schema, []), {
        name: "arrow_data",
        create: true,
      });
    }
    return { id: "arrow_data", label: "Arrow IPC 数据", sql: '"main"."arrow_data"' };
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

function tableSources(table: Awaited<ReturnType<AsyncDuckDBConnection["query"]>>): QuerySource[] {
  const catalogs = table.getChildAt(0);
  const schemas = table.getChildAt(1);
  const names = table.getChildAt(2);
  if (!catalogs || !schemas || !names) return [];
  return Array.from({ length: table.numRows }, (_, index) => {
    const catalog = String(catalogs.get(index));
    const schema = String(schemas.get(index));
    const name = String(names.get(index));
    return {
      id: `${catalog}.${schema}.${name}`,
      label: schema === "main" ? name : `${schema}.${name}`,
      sql: `${quoteIdentifier(catalog)}.${quoteIdentifier(schema)}.${quoteIdentifier(name)}`,
    };
  });
}

async function openDatabaseSources(connection: AsyncDuckDBConnection) {
  const tables = await connection.query(`
    SELECT table_catalog, table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    ORDER BY table_schema, table_name
  `);
  return tableSources(tables);
}

export async function createDuckDBSession(file: File, signal: AbortSignal): Promise<DataSession> {
  if (file.size > MAX_FILE_BYTES) throw new RangeError("Data file exceeds the 2 GiB limit");
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");

  const match = findDataFileFormat(file.name);
  if (!match) throw new Error("Unsupported data file extension");
  if (match.format.kind === "sqlite") {
    const { createSQLiteSession } = await import("./sqlite-session");
    return createSQLiteSession(file, signal);
  }
  const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
  if (!bundle.mainWorker) throw new Error("No compatible DuckDB worker bundle");
  const worker = new Worker(bundle.mainWorker);
  const database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  let connection: AsyncDuckDBConnection | undefined;
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", abort);
    await connection?.close().catch(() => undefined);
    await database.terminate().catch(() => undefined);
  };
  const abort = () => void dispose();
  signal.addEventListener("abort", abort, { once: true });

  try {
    await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    const registeredName = `${SOURCE_NAME}${match.extension}`;
    await database.registerFileHandle(
      registeredName,
      file,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true,
    );
    if (match.format.kind === "database") {
      await database.open({
        path: registeredName,
        accessMode: duckdb.DuckDBAccessMode.READ_ONLY,
        useDirectIO: true,
      });
    }
    connection = await database.connect();
    let sources: QuerySource[];
    if (match.format.kind === "database") {
      sources = await openDatabaseSources(connection);
    } else if (match.format.kind === "arrow") {
      sources = [await importArrow(connection, file, signal)];
    } else {
      sources = [fileSource(match.format.kind, registeredName)];
    }
    if (sources.length === 0) throw new Error("The DuckDB database contains no tables");

    return {
      dataSets: sources.map(({ id, label }) => ({ id, label })),
      async query(dataSetId, offset, limit) {
        if (disposed || signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
        const source = sources.find(({ id }) => id === dataSetId);
        if (!source) throw new Error("Unknown data set");
        const result = await connection!.query(
          `SELECT * FROM ${source.sql} LIMIT ${limit + 1} OFFSET ${offset}`,
        );
        const rowCount = Math.min(result.numRows, limit);
        const vectors = result.schema.fields.map((_, index) => result.getChildAt(index));
        return {
          columns: result.schema.fields.map((field) => ({ name: field.name, type: String(field.type) })),
          rows: Array.from({ length: rowCount }, (_, row) =>
            vectors.map((vector) => formatValue(vector?.get(row))),
          ),
          hasMore: result.numRows > limit,
        } satisfies DataPage;
      },
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
