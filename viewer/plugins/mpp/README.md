# Microsoft Project 查看器 (`microsoft-project`)

## 基本介绍

- **插件 ID**：`microsoft-project`
- **格式入口**：`.mpp`，等级 3；仅 MPP14（Project 2010 及以后保存），更早版本和加密文件在打开阶段拒绝
- 在浏览器本地只读解析项目计划，展示任务、日期、依赖和资源。

## 实现原理

- [src/probe.ts](src/probe.ts) 有界读取文件头确认版本；[src/index.ts](src/index.ts) 校验 128 MiB 输入上限后交给 [Worker](src/kernel.worker.ts)。
- Worker 加载自建的 mppgo Go→WASM 读取器（同源锁定版本），返回结构化项目文档，[src/ui.ts](src/ui.ts) 用原生 DOM 渲染。
- 构建配方、许可证和复现步骤见 [tools/mppgo-build](../../../tools/mppgo-build/README.md)；应用构建只校验和复制 `third_party/mppgo` 资产。

## 已知限制

- 不支持加密文件、日历、自定义字段、成本、编号基线、依赖箭头或重新排程；部分布局可能缺日期，界面保留空白而不编造。
- 运行时预算和界面细节见 [tools/mppgo-build](../../../tools/mppgo-build/README.md)。

## 开发与验证

- [examples/](examples/) 为 MPXJ 仓库真实文件，来源与许可见其 README；`unsupported-mpp12.mpp` 为预期拒绝样例。

```bash
pnpm test viewer/plugins/mpp
node tools/mppgo-build/smoke.mjs viewer/plugins/mpp/examples/task-dates-2010.mpp
```
