import { defineFormat } from "./define-format";

export const tsvFormat = defineFormat(
  "tsv",
  "code-data",
  5,
  { name: "TSV data", title: "Open TSV Data Online", description: "Inspect tab-separated records locally in a virtualized table.", introduction: "TSV uses tab characters between fields, making it useful when values contain commas. Anyfile reads supported plain or compressed variants through DuckDB-Wasm and pages the result.", canShow: ["Tab-delimited columns and inferred types","Plain, gzip and Zstandard variants"], limitations: ["Tabs inside malformed fields can shift columns","Nested data and spreadsheet formatting are not represented"], faq: [{ question: "When should TSV be used instead of CSV?", answer: "TSV avoids comma ambiguity, but fields still need valid quoting when they contain tabs or newlines." }] },
  { name: "TSV 数据", title: "在线打开 TSV 数据", description: "在本地虚拟化表格中检查制表符分隔记录。", introduction: "TSV 使用制表符分隔字段，适合数值本身包含逗号的场景。Anyfile 通过 DuckDB-Wasm 读取受支持的普通或压缩变体，并分页展示结果。", canShow: ["制表符分隔列与推断类型","普通、gzip 与 Zstandard 变体"], limitations: ["损坏字段中的制表符可能导致列错位","不表达嵌套数据与电子表格格式"], faq: [{ question: "何时应使用 TSV 而不是 CSV？", answer: "TSV 避免逗号歧义，但字段含制表符或换行时仍需合法引用。" }] },
  {},
  undefined,
  ["tab","tsv.gz","tab.gz","tsv.zst","tab.zst"],
);

