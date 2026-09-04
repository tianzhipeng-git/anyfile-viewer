<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 项目总体思路
- 文件在浏览器中直接读取与预览，不上传到服务器, 不用下载桌面软件。 速度更快, 隐私更好。
- 支持的文件格式, 超级超级多, 项目追求的主要是支持的格式多, 而不是支持等级高。
- 只提供查看功能, 不提供编辑, 要轻量、快、能打开大文件。


# 项目文档阅读路由
对待项目文档/review建议/用户意见, 要采取怀疑的态度, 秉承实事求是, 而不是一味地服从指令, 有必要时是可以修改现有方案和设计的.

开始修改前，先根据任务范围阅读对应文档；一个任务涉及多个范围时，需要组合阅读。不要用本文档摘要代替原文中的完整约束。

| 任务场景 | 必读文档 |
|---|---|
| 新增或修改查看器插件、Manifest、插件注册与选择、`open()` 上下文、工作区读取、生命周期、错误码、协议版本或协议合规测试 | `docs/viewer-plugin-protocol.md` |
| 修改插件内的 DOM、布局、滚动、第三方渲染器、异步渲染、加载与错误 UI、样式、主题、无障碍、内容安全或渲染性能 | `docs/viewer-render-tips.md` |
| 修改插件加载方式、静态/动态导入边界、SSG/SSR、Worker/WASM、jsDelivr 与本地回退、依赖版本、部署头、CSP 或首包体积 | `docs/viewer-loading-and-deployment.md` |
| 从第三方源码自行构建 WASM、Worker、JavaScript glue 或其他二进制资产，维护 `tools/` 构建配方、`third_party/` 审核产物、patch、升级或 vendoring 流程 | `docs/viewer-source-built-dependencies.md`、`docs/viewer-loading-and-deployment.md` |
| 设计或修改 `viewer-ui`、共享渲染基础设施、Canvas/视口/缩放/渲染调度/资源管理、renderer adapter，或评估 Lit、d3-zoom、Konva、PixiJS、OpenSeadragon、Three.js 等选型 | `docs/viewer-ui-and-rendering-proposal.md` |
| 新增或修改视频查看器、视频容器/codec 支持、视频 probe、播放管线、音画同步或视频支持声明 | `docs/videos/architecture.md`、`docs/videos/support-matrix.md`、`docs/videos/roadmap.md` |
| 新增或修改音频查看器、音频容器/裸码流/codec/sample format 支持、音频 probe、PCM/Web Audio 播放管线或音频支持声明 | `docs/audio/architecture.md`、`docs/audio/support-matrix.md`、`docs/audio/roadmap.md` |
| 修改共享 FFmpeg 播放 runtime、`ffmpeg-video` / `ffmpeg-audio` adapter、FFmpeg Worker/WASM、C bridge、构建裁剪、轨道选择或运行资产复用 | `docs/videos/ffmpeg-playback-runtime-plan.md`、`docs/videos/architecture.md`、`docs/audio/architecture.md`、`docs/viewer-source-built-dependencies.md`、`docs/viewer-loading-and-deployment.md` |
| 新增或修改 3D CAD、通用网格、CG、3D 打印或点云查看器，或修改共享 3D runtime、相机、场景、Three.js、3D Worker/WASM、关联资源与 3D 支持声明 | `docs/3d/architecture.md`、`docs/3d/support-matrix.md`、`docs/3d/roadmap.md`、`docs/viewer-ui-and-rendering-proposal.md`、`docs/viewer-loading-and-deployment.md`；涉及源码构建时再读 `docs/viewer-source-built-dependencies.md` |
