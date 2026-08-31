import { defineFormat } from "./define-format";

export const csvFormat = defineFormat(
  "csv",
  "code-data",
  5,
  { name: "CSV data", title: "Open CSV Data Online", description: "Query comma-separated data locally in a paged table.", introduction: "CSV stores rows as delimited text, but quoting, encodings and inferred types still need parsing. Anyfile registers the selected file with DuckDB-Wasm and returns bounded Arrow batches to the table viewer.", canShow: ["Inferred columns and data types","Paged rows from plain, gzip or Zstandard CSV"], limitations: ["Delimiter and type inference can misread irregular files","CSV does not preserve formulas or workbook formatting"], faq: [{ question: "Can Anyfile open a very large CSV?", answer: "It avoids rendering every row at once, but parsing and queries still use this device’s memory." }] },
  { name: "CSV 数据", title: "在线打开 CSV 数据", description: "在本地以分页表格查询逗号分隔数据。", introduction: "CSV 以分隔文本保存记录，但引号、编码与推断类型仍需解析。Anyfile 把所选文件注册到 DuckDB-Wasm，并以有界 Arrow 批次返回表格查看器。", canShow: ["推断后的列与数据类型","来自普通、gzip 或 Zstandard CSV 的分页记录"], limitations: ["分隔符与类型推断可能误读不规则文件","CSV 不保留公式或工作簿格式"], faq: [{ question: "Anyfile 能打开很大的 CSV 吗？", answer: "它不会一次渲染所有记录，但解析和查询仍会使用当前设备内存。" }] },
  {},
  undefined,
  ["csv.gz","csv.zst"],
);

