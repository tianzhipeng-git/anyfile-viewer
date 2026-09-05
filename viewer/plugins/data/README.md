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
   - 优先从 jsDelivr CDN 加载 DuckDB bundle，失败后依次回退到 `assets.anyfile.top` 的 R2 同版本镜像和本地 `@duckdb/duckdb-wasm` 资源
   - 在 Web Worker 中实例化 WASM 引擎

2. **会话建立**（`src/duckdb-session.ts`）
   - 按扩展名识别格式（`src/formats.ts`）
   - 文件注册到 DuckDB 虚拟文件系统后执行对应读取函数：
     - CSV/TSV → `read_csv_auto()`
     - JSON → `read_json_auto()`
     - Parquet → `read_parquet()`
     - Arrow → 流式 `RecordBatchReader` + `insertArrowTable()`
     - DuckDB → 以 `READ_ONLY` 和 `useDirectIO` 打开注册文件，枚举 `information_schema.tables`
   - 文件大小上限 2 GiB

3. **查询与展示**
   - 对选中数据集执行 `SELECT * ... LIMIT/OFFSET` 分页
   - 列类型与值经 `formatValue()` 格式化为字符串
   - UI 复用 `@anyfile/viewer-ui` 的 `createPagedTableViewer`

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/runtime-assets` | 锁定版本的运行时资产加载与来源回退 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | 共享分页表格界面 |
| `@duckdb/duckdb-wasm@1.32.0` | 浏览器内数据读取与 SQL 查询引擎 |
| `apache-arrow@17.0.0` | Arrow IPC 解析与导入 |

## 已知限制

- 需要浏览器支持 **WebAssembly + Web Worker**；不满足时报 `unsupported-environment`
- 首次打开需加载 DuckDB Worker/WASM，冷启动时间受资产体积与网络缓存影响
- 2 GiB 文件大小硬上限；超大文件可能 OOM
- 界面仅提供内置分页查询，不开放用户 SQL 控制台或写入原文件；Arrow 数据在内存表中导入
- 复杂嵌套 JSON 展平方式由 DuckDB 决定，可能与预期不完全一致
- 压缩 CSV/JSON 依赖 DuckDB 内置解压，部分非标准压缩可能失败
- Arrow 流式导入全量加载到内存表，大文件内存压力高
- 不支持 Excel（`.xlsx`）、SQLite（`.db`）——分别由 excel / sqlite 插件负责

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/data-viewer test
```
