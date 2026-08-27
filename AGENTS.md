<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 项目文档阅读路由

开始修改前，先根据任务范围阅读对应文档；一个任务涉及多个范围时，需要组合阅读。不要用本文档摘要代替原文中的完整约束。

| 任务场景 | 必读文档 |
|---|---|
| 新增或修改查看器插件、Manifest、插件注册与选择、`open()` 上下文、工作区读取、生命周期、错误码、协议版本或协议合规测试 | `docs/viewer-plugin-protocol.md` |
| 修改插件内的 DOM、布局、滚动、第三方渲染器、异步渲染、加载与错误 UI、样式、主题、无障碍、内容安全或渲染性能 | `docs/viewer-render-tips.md` |
| 修改插件加载方式、静态/动态导入边界、SSG/SSR、Worker/WASM、jsDelivr 与本地回退、依赖版本、部署头、CSP 或首包体积 | `docs/viewer-loading-and-deployment.md` |
| 设计或修改 `viewer-ui`、共享渲染基础设施、Canvas/视口/缩放/渲染调度/资源管理、renderer adapter，或评估 Lit、d3-zoom、Konva、PixiJS、OpenSeadragon、Three.js 等选型 | `docs/viewer-ui-and-rendering-proposal.md` |