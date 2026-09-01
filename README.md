# Anyfile Viewer

一个 local-first 的浏览器文件查看器。

核心特点: 
- 文件在浏览器中直接读取与预览，不上传到服务器, 不用下载桌面软件。 速度更快, 隐私更好。
- 支持的文件格式 超级超级多, 项目追求的支持的格式多, 而不是支持等级高。
- 只提供查看功能 不提供编辑, 要轻量、快、能打开大文件。

先阅读核心的[格式查看器插件协议](docs/viewer-plugin-protocol.md)和[查看器加载、渲染与部署约定](docs/viewer-loading-and-deployment.md)。

## 开发

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 页面

- `/`：首页与格式类别入口
- `/categories/[slug]`：类别页
- `/formats/[extension]`：文件格式详情页
- `/view`：本地文件查看器工作区

当前查看器通过 `viewer/` 下的统一协议按文件格式动态加载：

- PDF
- Word（DOCX）
- Excel 与电子表格（XLSX、XLSM、XLSB、XLS、ODS、Numbers 等）
- PowerPoint（PPTX）
- 代码与文本
- CSV、JSON、Parquet、Arrow 与 DuckDB
- 独立的 SQLite（SQLite/SQLite3/DB）插件

`viewer/ui` 是插件共享 UI 层。Excel、DuckDB 数据和 SQLite 查看器复用其中的分页表格渲染器；协议类型仍独立保留在 `viewer/protocol`。

DuckDB 的 WASM 与 Worker 优先从官方 jsDelivr 固定版本资源加载；CDN 初始化失败时自动回退到构建产物中的同版本本地资源。其他格式可按 `viewer-plugin-protocol.md` 继续接入。

HEVC HEIF/HEIC 会先尝试浏览器原生解码，失败后在独立 Worker 中按需加载同源、可审计的 `libheif + libde265` WASM；用户文件仍不会上传。

## 验证

```bash
pnpm test
pnpm lint
pnpm build
```

`pnpm build` 还会检查 `/view` 的初始 JavaScript 体积，并阻止查看器实现意外进入首包。

插件也可以独立测试：

```bash
pnpm --filter @anyfile/pdf-viewer test
pnpm --filter @anyfile/word-viewer test
pnpm --filter @anyfile/excel-viewer test
```
