# Microsoft Project 查看器 (`microsoft-project`)

## 基本介绍

- **插件 ID**：`microsoft-project`
- **格式入口**：`.mpp`，等级 3；仅 MPP14（Project 2010 及以后保存），更早版本和加密文件在打开阶段拒绝
- 在浏览器本地只读解析项目计划，展示任务、日期、依赖和资源。

## 实现原理

- [src/probe.ts](src/probe.ts) 有界读取文件头确认版本；[src/index.ts](src/index.ts) 校验 128 MiB 输入上限后交给 [Worker](src/kernel.worker.ts)。
- [src/engine.ts](src/engine.ts) 启动自建的 mppgo Go→WASM 读取器（同源锁定版本）并解析为结构化项目文档；Worker 只做消息转发，[src/ui.ts](src/ui.ts) 用原生 DOM 渲染。
- 构建配方、许可证和复现步骤见 [tools/mppgo-build](../../../tools/mppgo-build/README.md)；应用构建只校验和复制 `third_party/mppgo` 资产。

## Agent extract

[src/extract.ts](src/extract.ts) 在 Node worker 内经 `context.vendor` 加载同一 mppgo 资产，复用 `engine.ts`：

- `inspect`：项目名、任务/摘要任务/里程碑/资源/分配数量、活动任务的最早开始与最晚完成。
- `read` 目标：`tasks`（ID、WBS、层级、名称、开始/完成、工期、完成百分比、前置任务如 `3FS+1d`、资源、标记、备注）、`resources`、`assignments`（任务↔资源）；均为 Markdown 表格，`row:` 游标分页，支持 `filter`。默认读 `tasks`，无任务时读 `resources`。
- 错误映射：加密 → `encrypted-file`，MPP12 及更早 → `invalid-file`。不支持 `render`。

## 已知限制

- 不支持加密文件、日历、自定义字段、成本、编号基线、依赖箭头或重新排程；部分布局可能缺日期，界面保留空白而不编造。
- 运行时预算和界面细节见 [tools/mppgo-build](../../../tools/mppgo-build/README.md)。

## 开发与验证

- [examples/](examples/) 为 MPXJ 仓库真实文件，来源与许可见其 README；`unsupported-mpp12.mpp` 为预期拒绝样例。

```bash
pnpm test viewer/plugins/mpp
node tools/mppgo-build/smoke.mjs viewer/plugins/mpp/examples/task-dates-2010.mpp
```
