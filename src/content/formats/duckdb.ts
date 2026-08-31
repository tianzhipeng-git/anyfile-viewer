import { defineFormat } from "./define-format";

export const duckdbFormat = defineFormat(
  "duckdb",
  "code-data",
  5,
  { name: "DuckDB database", title: "Open DuckDB Databases Online", description: "Browse DuckDB schemas and tables locally in read-only views.", introduction: "A DuckDB database keeps analytical tables, indexes and metadata in one file. Anyfile attaches the selected database to DuckDB-Wasm and exposes schema-driven, paged inspection without sending it to a server.", canShow: ["Schemas, tables, columns and paged rows","Values decoded by the compatible DuckDB-Wasm engine"], limitations: ["Files from incompatible storage versions may not open","The viewer does not expose arbitrary SQL or write changes"], faq: [{ question: "Can viewing a DuckDB file modify it?", answer: "No. Anyfile uses a read-only inspection path and never saves database changes to the selected file." }] },
  { name: "DuckDB 数据库", title: "在线打开 DuckDB 数据库", description: "以只读视图在本地浏览 DuckDB schema 与数据表。", introduction: "DuckDB 数据库在单个文件中保存分析型表、索引和元数据。Anyfile 把所选数据库挂载到 DuckDB-Wasm，以 schema 驱动的分页方式检查，不发送到服务器。", canShow: ["schema、数据表、列与分页记录","由兼容 DuckDB-Wasm 引擎解码的值"], limitations: ["不兼容存储版本的文件可能无法打开","查看器不开放任意 SQL，也不写入修改"], faq: [{ question: "查看 DuckDB 文件会修改它吗？", answer: "不会。Anyfile 使用只读检查路径，绝不会把数据库修改保存到所选文件。" }] },
  {},
  undefined,
  ["ddb"],
);

