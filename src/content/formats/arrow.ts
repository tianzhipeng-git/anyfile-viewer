import { defineFormat } from "./define-format";

export const arrowFormat = defineFormat(
  "arrow",
  "code-data",
  5,
  { name: "Arrow IPC data", title: "Open Arrow and Feather Data Online", description: "Inspect Arrow IPC batches and typed columns locally.", introduction: "Arrow IPC preserves a columnar schema and record batches for efficient interchange. Anyfile opens supported file or stream layouts through DuckDB-Wasm and presents their rows in the shared table.", canShow: ["Column names, logical types and record batches","Paged values from Arrow IPC or compatible Feather files"], limitations: ["Unsupported extension metadata may be ignored","Streams and files have different footer behavior"], faq: [{ question: "Are Arrow and Feather always identical?", answer: "Feather v2 uses Arrow IPC, while older or specialized files can differ from the layouts the viewer accepts." }] },
  { name: "Arrow IPC 数据", title: "在线打开 Arrow 与 Feather 数据", description: "在本地检查 Arrow IPC 批次与类型化列。", introduction: "Arrow IPC 为高效交换保留列式 schema 与 record batch。Anyfile 通过 DuckDB-Wasm 打开受支持的文件或流布局，并在共享表格中展示记录。", canShow: ["列名、逻辑类型与 record batch","来自 Arrow IPC 或兼容 Feather 文件的分页值"], limitations: ["不支持的扩展元数据可能被忽略","流与文件的 footer 行为不同"], faq: [{ question: "Arrow 与 Feather 总是相同吗？", answer: "Feather v2 使用 Arrow IPC，但旧版或专用文件可能不同于查看器接受的布局。" }] },
  {},
  undefined,
  ["arrows","ipc","feather"],
);

