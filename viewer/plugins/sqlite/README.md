# SQLite 查看器 (`sqlite-database`)

使用 sql.js（SQLite WASM）在浏览器中只读浏览 SQLite 数据库文件。

## 基本介绍

- **插件 ID**：`sqlite-database`
- **支持格式**：`.sqlite`、`.sqlite3`、`.db`
- **能力**：枚举用户表/视图、分页浏览表数据（每页 100 行）、显示列类型
- **示例文件**：`examples/products.sqlite`

## 实现原理

1. **运行时初始化**（`src/session.ts`）
   - `sql.js` 加载 WASM（`sql-wasm.wasm`）
   - 流式读取整个数据库文件到内存（上限 256 MiB）
   - `new SQL.Database(bytes)` 打开内存数据库

2. **表发现**
   - 查询 `sqlite_master`，列出 `type IN ('table', 'view')` 且非 `sqlite_%` 前缀的对象

3. **分页查询**
   - `SELECT * FROM "table" LIMIT ? OFFSET ?`
   - BLOB 列格式化为十六进制字符串；其余 `String()` 转换
   - `hasMore` 通过多取一行判断

4. **UI**
   - `@anyfile/viewer-ui` 的 `createPagedTableViewer`
   - 表名下拉 + 上一页/下一页

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议 |
| `@anyfile/viewer-ui` | 分页表格 UI |
| `sql.js@1.14.2` | SQLite WASM 引擎 |

## 已知限制

- 需要浏览器支持 **WebAssembly**
- 256 MiB 文件大小硬上限；整库加载到内存
- 只读：不支持写入、VACUUM、ATTACH 其他库
- 不支持 SQL 控制台或自定义查询
- 加密/SQLCipher 数据库无法打开
- 外键约束、触发器不影响只读 SELECT，但不执行
- WAL 模式下若仅拷贝 `.db` 而未合并 `-wal`，可能看到过期数据
- 与 DuckDB 插件（`.duckdb`）互不重叠；与 data 插件的 CSV/Parquet 等格式分开
