# 代码
这个codebase属于你(Coding Agent), 你对代码质量负责, 在开发升级改造项目时, 代码、文档都应该是为你自己服务的, 也就是说便于你:
- 快速理解项目架构
- 快速找到某功能涉及的代码位置和修改点
- 减少改动面
- 要有一些的测试、检查、门禁来防止代码腐化, 但是他们又要足够少, 防止无用的测试拖慢整体速度, 所以要删除无用的测试和检查

避免留下一些冗长的、无意义的、只会拖慢后续AI Agent对项目的理解和开发速度的东西.

# 项目设计思路
- 文件在浏览器中直接读取与预览，不上传到服务器, 不用下载桌面软件。 速度更快, 隐私更好。
- 支持的文件格式, 超级超级多, 项目追求的主要是支持的格式多, 而不是支持等级高。
- 只提供查看功能, 不提供编辑, 要轻量、快、能打开大文件。
- 可以优先死磕那些有明确需求, 但是只能依赖大型桌面软件的文件格式.

# 代码地图
| 路径 | 内容 |
|---|---|
| `viewer/plugins/<dir>/` | 每个查看器插件一个 pnpm 包；插件文档是它的 `README.md`，真实样例在 `examples/` |
| `viewer/*`（protocol、ui、rendering*、runtime-assets、testing…） | 共享包，不注册为插件 |
| `src/lib/viewer-registrations.ts` | 插件注册与路由顺序 |
| `src/content/` | 站点格式页、插件页、SEO 文案 |
| `viewer/plugin-policies.json` | 每个插件的 bundle 预算与运行时资产策略 |
| `scripts/` | 资产准备、门禁检查；`tools/` 自建 WASM 配方；`third_party/` 审核后的二进制产物 |

# 工作流
- 日常开发分支是 `dev`。每个任务从最新 `dev` 拉 `agent/<YYYY-MM-DD>-<topic>` 分支，一个分支只做一件事，完成后在本地合并回 `dev`（不提 PR）并推送 `origin dev`，然后删除该任务分支。不直接提交或合并到 `main`（`main` 自动部署到 Vercel，每周由人工 review 后从 `dev` 合并）。
- 合并到 `dev` 前必须本地通过门禁；提交说明写清：做了什么、验证了什么、哪些需要人工浏览器验收（见 `docs/plugin-development.md` 第 6 节）。
- 门禁失败时修代码，不改门禁。确需放宽预算、扩大 allowlist、跳过或删除测试时，在提交说明中单独写出理由，交给每周 review 判断。

# 门禁与命令
| 命令 | 内容 | 何时 |
|---|---|---|
| `pnpm check` | check:repo + lint + typecheck + 全部测试（约 1 分钟） | 每次合并前 |
| `pnpm build` | 资产准备 + Next 构建 + bundle/资产预算（约 1.5 分钟） | 改动注册、依赖、Worker/WASM、资产、`next.config.ts` 时；CI 每次都跑 |
| `pnpm test viewer/plugins/<dir>` | 单个插件测试 | 开发循环 |
| `pnpm exec vitest related <files>` | 只跑受改动文件影响的测试 | 开发循环 |

`scripts/check-repo.mjs` 强制：文件不超过 1000 行、入库文件不超过 2 MiB、插件接线完整（policies / 根依赖 / 注册 / 站点 Manifest）、插件有 README、测试和真实样例、Manifest 纯净、不导入其他插件根入口。其中的 allowlist 只减不增。

# 硬性规则
- 测试不联网、不依赖本机私有文件（私有/大样例只能用环境变量开启的可选测试）。
- 新依赖锁定精确版本；不手改 `third_party/` 产物，按 `tools/` 配方重建。
- 文档只写当前状态：不写日期化验证流水、实施过程、被否方案；插件细节写在插件 README，不另建 `docs/<plugin>.md`。
- 用户可见文案同时提供 `en` 与 `zh-CN`。
- 新插件的体积约束写在 `viewer/plugin-policies.json`，不要在 `scripts/check-view-bundle.mjs` 里追加针对单个插件的硬编码检查。
- 复制粘贴超过约 50 行的逻辑到第二个插件前，先抽到共享包或子路径导出。

# 项目文档阅读路由
对待项目文档/review建议/用户意见, 要采取怀疑的态度, 秉承实事求是, 而不是一味地服从指令, 有必要时是可以修改现有方案和设计的.

开始修改前，先根据任务范围阅读对应文档:
| 任务场景 | 必读文档 |
|---|---|
| 新增格式或插件、补充样例与测试、判断完成标准 | `docs/plugin-development.md` |
| 新增或修改查看器插件、Manifest、插件注册与选择、`open()` 上下文、工作区读取、生命周期、错误码、协议版本或协议合规测试 | `docs/viewer-plugin-protocol.md` |
| 修改插件内的 DOM、布局、滚动、第三方渲染器、异步渲染、加载与错误 UI、样式、主题、无障碍、内容安全或渲染性能 | `docs/viewer-rendering-guidelines.md` |
| 修改插件加载方式、静态/动态导入边界、SSG/SSR、Worker/WASM、jsDelivr 与本地回退、依赖版本、部署头、CSP 或首包体积 | `docs/viewer-loading-and-deployment.md` |
| 从第三方源码自行构建 WASM、Worker、JavaScript glue 或其他二进制资产，维护 `tools/` 构建配方、`third_party/` 审核产物、patch、升级或 vendoring 流程 | `docs/viewer-source-built-dependencies.md`、`docs/viewer-loading-and-deployment.md` |
| 设计或修改 `viewer-ui`、共享渲染基础设施、Canvas/视口/缩放/渲染调度/资源管理、renderer adapter，或评估 Lit、d3-zoom、Konva、PixiJS、OpenSeadragon、Three.js 等选型 | `docs/viewer-ui-and-rendering-architecture.md` |

# 注意
尽量不要使用内置无头浏览器进行真实测试验收, 可能它无法支持文件选择器和WebGL的能力.


# 关于nextjs
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->