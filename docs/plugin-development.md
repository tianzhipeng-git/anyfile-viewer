# 插件开发清单

新增格式或插件时按本文执行。接口语义见[插件协议](viewer-plugin-protocol.md)，UI 与验收细节见[渲染规范](viewer-rendering-guidelines.md)，Worker/WASM/资产见[加载部署约定](viewer-loading-and-deployment.md)。

## 1. 先决定放在哪里

- 同一解析器或渲染链路能覆盖的新扩展名，扩展现有插件的 Manifest，不新建插件。
- 只有解析/渲染链路独立时才新建插件。两个以上插件需要的代码放进 `viewer/*` 共享包；只有一个调用方时可通过源插件 `package.json` 的子路径 `exports` 暴露，禁止导入其他插件的根入口（完整查看器）。
- 依赖大型 WASM、GPL 等传染性许可证或自建二进制前，先读[源码构建规范](viewer-source-built-dependencies.md)。

## 2. 插件目录

```
viewer/plugins/<dir>/
  package.json        # name @anyfile/<x>-viewer；exports: ".", "./manifest", "./probe"（如有）
  README.md           # 当前能力、实现、依赖、限制、验证命令；不写日期和验证流水
  examples/           # 真实样例 + README.md（来源、许可证、每个文件的用途）
  src/manifest.ts     # 纯数据，只能导入 @anyfile/viewer-protocol 和本地纯数据
  src/probe.ts        # 有界读取，不加载解析器/渲染器
  src/index.ts        # 导出 FileViewerPlugin，只有 open()
  src/*.test.ts
```

参考实现：简单 DOM 插件看 `har`，Worker + WASM 看 `mpp`，Canvas/视口看 `dicom`，三维看 `ifc`。

## 3. 接线清单

| 位置 | 内容 | 门禁 |
|---|---|---|
| 根 `package.json` | `"@anyfile/<x>": "workspace:*"`，然后 `pnpm install` | check:repo |
| `src/lib/viewer-registrations.ts` | 导入 Manifest，按路由优先级插入注册项 | check:repo |
| `src/lib/viewer-protocol.test.ts` | 有 probe 时更新 probe 顺序断言，补路由用例 | test |
| `viewer/plugin-policies.json` | 插件条目；有运行时资产时写 `runtimeSets` | check:repo、build |
| `src/content/manifests.ts`、`src/content/plugins.ts`、`src/content/formats/` | 站点插件页与格式页（中英文） | test |
| `src/components/file-type-icon.tsx` | 文件树语义分类 | test |
| `scripts/prepare-*-assets.mjs`、`THIRD_PARTY_NOTICES.md` | 仅有运行时资产时 | build |
| 领域支持矩阵（如 `docs/3d/support-matrix.md`） | 新格式的等级与验证状态 | 人工 |

## 4. 真实样例

- 每个插件必须在 `examples/`（或 `fixtures/`）提供至少一个真实格式文件。优先使用上游测试集、可再分发公开样例或用真实软件/库生成的原创文件；手写字节只用于单元测试内的边界构造。
- `examples/README.md` 写明来源 URL 或生成方式、许可证、每个文件覆盖什么。不能确认可再分发的文件不入库。
- 单文件不超过 2 MiB（check:repo 强制），尽量小于 512 KiB。大文件、私有文件和公开下载集合通过环境变量启用的测试读取本地路径，例如 `IFC_TEST_FILE=/abs/model.ifc pnpm test viewer/plugins/ifc`；测试不联网。
- 负样例文件名包含 `disguised`、`truncated`、`corrupt`、`invalid`、`unsupported` 或 `counterexample`。其余样例由 [plugin-examples.test.ts](../src/lib/plugin-examples.test.ts) 自动检查必须路由到本插件。

## 5. 确定性测试

用 `@anyfile/viewer-test` 的 `createViewerTestContext`、`createTrackedFile`、`truncated` 等工具。每个插件至少覆盖：

- **真实样例**：probe 返回预期等级；能在 Node/happy-dom 中运行的解析器，对真实样例断言解析出的具体内容（页数、尺寸、文本、节点数等），不只断言“没有抛错”。
- **拒绝**：损坏、截断、伪装扩展名的输入在 probe 返回 0 或 `open()` 以正确 `ViewerError` code reject，且容器内无残留。
- **上限**：超过输入/解码预算时返回 `resource-limit`；probe 只读有界范围（`assertReadsWithin`）。
- **生命周期**：opening 中 abort、active 后 abort、`dispose()` 重复调用；之后不再更新 DOM、不报告进度，Worker/Object URL/监听器已释放。
- 依赖浏览器能力（WebGL、WebCodecs、Canvas 像素）的部分可以 mock 渲染器，但解析层仍需用真实样例测试。

不写快照测试、不测第三方库自身行为、不为一次性排查留下测试。

## 6. 浏览器验收

Agent 环境的无头浏览器无法可靠使用文件选择器和 WebGL，不作为合规依据。涉及 Canvas/WebGL/媒体播放/滚动布局的改动，在提交说明中列出“需人工浏览器验收”的样例和检查点（打开、缩放/翻页、窄窗口、切换文件、错误状态），由每周 dev→main review 统一执行。

## 7. 完成定义

- `pnpm check` 通过；改动涉及注册、依赖、Worker/WASM、资产或 `next.config.ts` 时 `pnpm build` 也通过。
- 插件 README 与支持矩阵反映当前能力；没有新增日期化的验证记录或证据文件。
- 没有为了通过门禁而放宽预算、扩大 allowlist、跳过或删除测试；确需调整时在提交说明中给出理由。
