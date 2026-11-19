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


# 项目文档阅读路由
对待项目文档/review建议/用户意见, 要采取怀疑的态度, 秉承实事求是, 而不是一味地服从指令, 有必要时是可以修改现有方案和设计的.

开始修改前，先根据任务范围阅读对应文档:
| 任务场景 | 必读文档 |
|---|---|
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