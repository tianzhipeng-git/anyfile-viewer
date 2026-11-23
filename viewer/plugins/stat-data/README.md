# 统计数据查看器 (`stat-data`)

在浏览器本地只读查看 SPSS、Stata 与 SAS 数据集：变量、值标签、缺失值规则、文件元数据与分页数据行。

## 基本介绍

- **插件 ID**：`statistical-data`
- **格式入口**：`.sav` `.zsav`（SPSS）、`.por`（SPSS 可移植）、`.dta`（Stata 104–119）、`.sas7bdat`（SAS）、`.xpt`（SAS XPORT v5/v8）
- **支持等级**：文件头签名匹配为 4；`.por` 签名较弱（第 456 字节附近的 `SPSSPORT`）为 3。
- **视图**：数据（每 100 列一个列窗口、每页 100 行）、变量、值标签、文件信息，均通过 `@anyfile/viewer-ui` 的 `createPagedTableViewer` 切换。

## 实现原理

1. [src/probe.ts](src/probe.ts) 只读前 1 KiB，按魔数识别容器（`$FL2`/`$FL3`、`<stata_dta>` 或旧版 Stata 版本字节、SAS7BDAT 32 字节魔数、XPORT 头记录、`SPSSPORT`）。
2. [src/kernel.worker.ts](src/kernel.worker.ts) 加载自建 ReadStat WASM（配方 `tools/readstat-build/`，同源 `/vendor/readstat/1.1.9-anyfile.1/`）。WASM 通过 `readAt` 回调按需读取 `File`：Worker 用 `FileReaderSync` 维护 1 MiB 读窗口，大文件不整体载入内存。
3. [src/engine.ts](src/engine.ts) 封装 `_rs_schema` / `_rs_rows` 并解析适配器输出的 JSON；Worker 与 Node 测试共用。每页重新解析，只请求该页的行偏移、行数与列窗口（非窗口列由 ReadStat 跳过）。
4. [src/format-value.ts](src/format-value.ts) 格式化单元格：值标签显示为 `标签 (值)`；系统缺失为 `.`、标记缺失为 `.a`；按变量格式把 SPSS（1582-10-14 起的秒）、Stata（`%td` 天 / `%tc` 毫秒 / `%tw` `%tm` `%tq` `%th` `%ty`）与 SAS（1960 起的天 / 秒）转成 ISO 日期时间；数值最多 15 位有效数字，SAS 截断存储（3–7 字节）只显示实际保留的有效位。
5. [src/views.ts](src/views.ts) 组织数据、变量、值标签与文件信息视图；行数未知（POR、XPT、部分 SAV）时多取一行判断是否还有下一页。

## 依赖

| 包 | 用途 |
|---|---|
| ReadStat 1.1.9（MIT，自建 WASM，含 zlib 1.3.1） | SPSS/Stata/SAS 解析 |
| `@anyfile/runtime-assets` | Worker RPC（超时、取消、终止） |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化 |
| `@anyfile/viewer-ui` | 分页表格 UI |

## 已知限制

- 不读取 `.sas7bcat` 目录，SAS 变量的格式目录值标签不会应用；不计算统计量，不执行 SPSS 语法、加权或多重响应集。
- 不支持加密的 SPSS / SAS 文件；多成员 XPORT 只显示第一个成员。
- 越靠后的页面越慢：压缩 SAV/ZSAV、POR、XPT 需要从数据开头解码到所请求的行；单次操作超过 120 秒终止 Worker。
- 每次调用 JSON 输出 48 MiB、文本单元格 4 KiB（超出以 `…` 截断）、值标签 200,000 条；WASM 内存上限 256 MiB。
- 旧版文件尾部的值标签区损坏时仍显示数据，并在页码信息与文件信息中提示元数据不完整。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)；真实样例见 [examples/](examples/README.md)。
- `src/engine.test.ts` 直接加载 `third_party/readstat/` 中的审核产物解析真实样例。

```bash
pnpm test viewer/plugins/stat-data
node tools/readstat-build/smoke.mjs third_party/readstat/1.1.9-anyfile.1 viewer/plugins/stat-data/examples
```
