import { defineFormat } from "./define-format";

export const parquetFormat = defineFormat(
  "parquet",
  "code-data",
  5,
  { name: "Apache Parquet data", title: "Open Parquet Files Online", description: "Browse columnar Parquet data locally without uploading a dataset.", introduction: "Parquet stores typed columns in compressed row groups for analytical workloads. Anyfile lets DuckDB-Wasm read metadata and request bounded result pages rather than materializing a whole table in the UI.", canShow: ["Schema, typed columns and paged rows","Common Parquet compression and logical types"], limitations: ["Encrypted or unsupported extension types may fail","Nested values are simplified for the table view"], faq: [{ question: "Does Anyfile load every Parquet row at once?", answer: "No. The viewer queries bounded pages, although DuckDB still reads the file locally as needed." }] },
  { name: "Apache Parquet 数据", title: "在线打开 Parquet 文件", description: "无需上传，在本地浏览列式 Parquet 数据。", introduction: "Parquet 以压缩 row group 保存带类型的列，面向分析工作负载。Anyfile 由 DuckDB-Wasm 读取元数据并请求有界结果页，不在 UI 一次物化整张表。", canShow: ["schema、类型化列与分页记录","常见 Parquet 压缩和逻辑类型"], limitations: ["加密或不支持的扩展类型可能失败","嵌套值会为表格视图简化"], faq: [{ question: "Anyfile 会一次加载全部 Parquet 记录吗？", answer: "不会。查看器查询有界分页，但 DuckDB 仍会按需在本地读取文件。" }] },
  {},
  undefined,
  ["parq","pq"],
);

