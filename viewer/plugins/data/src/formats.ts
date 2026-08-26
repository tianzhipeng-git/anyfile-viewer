export type DataFileKind =
  | "csv"
  | "tsv"
  | "json"
  | "parquet"
  | "arrow"
  | "database"
  | "sqlite";

export type DataFileFormat = {
  readonly kind: DataFileKind;
  readonly name: string;
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
};

export const DATA_FILE_FORMATS: readonly DataFileFormat[] = [
  {
    kind: "csv",
    name: "CSV 数据",
    extensions: [".csv", ".csv.gz", ".csv.zst"],
    mimeTypes: ["text/csv", "application/gzip", "application/zstd"],
  },
  {
    kind: "tsv",
    name: "TSV 数据",
    extensions: [".tsv", ".tab", ".tsv.gz", ".tab.gz", ".tsv.zst", ".tab.zst"],
    mimeTypes: ["text/tab-separated-values", "application/gzip", "application/zstd"],
  },
  {
    kind: "json",
    name: "JSON 数据",
    extensions: [
      ".json", ".jsonl", ".ndjson",
      ".json.gz", ".jsonl.gz", ".ndjson.gz",
      ".json.zst", ".jsonl.zst", ".ndjson.zst",
    ],
    mimeTypes: ["application/json", "application/jsonl", "application/x-ndjson"],
  },
  {
    kind: "parquet",
    name: "Parquet 数据",
    extensions: [".parquet", ".parq", ".pq"],
    mimeTypes: ["application/vnd.apache.parquet", "application/x-parquet"],
  },
  {
    kind: "arrow",
    name: "Arrow IPC 数据",
    extensions: [".arrow", ".arrows", ".ipc", ".feather"],
    mimeTypes: ["application/vnd.apache.arrow.file", "application/vnd.apache.arrow.stream"],
  },
  {
    kind: "database",
    name: "DuckDB 数据库",
    extensions: [".duckdb", ".ddb"],
    mimeTypes: ["application/vnd.duckdb", "application/x-duckdb"],
  },
  {
    kind: "sqlite",
    name: "SQLite 数据库",
    extensions: [".sqlite", ".sqlite3", ".db"],
    mimeTypes: ["application/vnd.sqlite3", "application/x-sqlite3"],
  },
];

export function findDataFileFormat(fileName: string) {
  const normalizedName = fileName.toLowerCase();
  for (const format of DATA_FILE_FORMATS) {
    const extension = format.extensions.find((candidate) => normalizedName.endsWith(candidate));
    if (extension) return { format, extension };
  }
  return undefined;
}
