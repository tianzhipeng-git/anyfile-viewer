# DuckDB 数据查看器 (`duckdb-data`)

使用 DuckDB-Wasm 在浏览器中查询并分页展示结构化数据文件。

## 基本介绍

- **插件 ID**：`duckdb-data`
- **支持格式**：
  - CSV / TSV（含 `.gz`、`.zst` 压缩变体）
  - JSON / JSONL / NDJSON（含压缩变体）
  - Parquet（`.parquet`、`.parq`、`.pq`）
  - Arrow IPC（`.arrow`、`.feather`、`.ipc`）
  - DuckDB 数据库（`.duckdb`、`.ddb`）
- **能力**：自动推断 schema、分页表格浏览（每页 100 行）、多表选择（DuckDB 库文件）
- **示例文件**：`examples/people.csv`、`people.parquet`、`events.arrow`、`analytics.ddb`

## 实现原理

1. **运行时初始化**（`src/duckdb-runtime.ts`）
   - 优先从 jsDelivr CDN 加载 DuckDB bundle，失败则回退到本地 `@duckdb/duckdb-wasm` 资源
   - 在 Web Worker 中实例化 WASM 引擎

2. **会话建立**（`src/duckdb-session.ts`）
   - 按扩展名识别格式（`src/formats.ts`）
   - 文件注册到 DuckDB 虚拟文件系统后执行对应读取函数：
     - CSV/TSV → `read_csv_auto()`
     - JSON → `read_json_auto()`
     - Parquet → `read_parquet()`
     - Arrow → 流式 `RecordBatchReader` + `insertArrowTable()`
     - DuckDB → 直接 attach，枚举 `information_schema` 表
   - 文件大小上限 2 GiB

3. **查询与展示**
   - 对选中数据集执行 `SELECT * ... LIMIT/OFFSET` 分页
   - 列类型与值经 `formatValue()` 格式化为字符串
   - UI 复用 `@anyfile/viewer-ui` 的 `createPagedTableViewer`

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议 |
| `@anyfile/viewer-ui` | 分页表格 UI |
| `@duckdb/duckdb-wasm@1.32.0` | 浏览器内 SQL 引擎 |
| `apache-arrow@17.0.0` | Arrow IPC 流解析 |

## 已知限制

- 需要浏览器支持 **WebAssembly + Web Worker**；不满足时报 `unsupported-environment`
- 首次打开需下载 DuckDB WASM（约数 MB），冷启动较慢
- 2 GiB 文件大小硬上限；超大文件可能 OOM
- 只读查询，不支持 INSERT/UPDATE/DDL
- 复杂嵌套 JSON 展平方式由 DuckDB 决定，可能与预期不完全一致
- 压缩 CSV/JSON 依赖 DuckDB 内置解压，部分非标准压缩可能失败
- Arrow 流式导入全量加载到内存表，大文件内存压力高
- 不支持 Excel（`.xlsx`）、SQLite（`.db`）——分别由 excel / sqlite 插件负责
