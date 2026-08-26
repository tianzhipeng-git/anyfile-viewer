# Anyfile Viewer

一个 local-first 的浏览器文件查看器。

核心特点: 
- 文件在当前浏览器标签页中读取与预览，不上传到服务器。速度更快, 隐私更好。
- 只提供查看功能 不提供编辑, 要轻量、快、能打开大文件。
- 支持的文件格式 超级超级多 超级超级全

先阅读核心的[格式查看器插件协议](docs/viewer-plugin-protocol.md)和[查看器加载、渲染与部署约定](docs/viewer-loading-and-deployment.md)。

## 开发

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 页面

- `/`：首页与格式类别入口
- `/categories/[slug]`：类别页
- `/formats/[extension]`：文件格式详情页
- `/view`：本地文件查看器工作区

当前查看器通过 `viewer/` 下的统一协议按文件格式动态加载：

- PDF 与 Excel（XLSX/XLSM）
- 代码与文本
- CSV、JSON、Parquet、Arrow 与 DuckDB
- 独立的 SQLite（SQLite/SQLite3/DB）插件

DuckDB 的 WASM 与 Worker 优先从官方 jsDelivr 固定版本资源加载；CDN 初始化失败时自动回退到构建产物中的同版本本地资源。其他格式可按 `viewer-plugin-protocol.md` 继续接入。

## 验证

```bash
npm test
npm run lint
npm run build
```

`npm run build` 还会检查 `/view` 的初始 JavaScript 体积，并阻止查看器实现意外进入首包。

插件也可以独立测试：

```bash
npm test -w @anyfile/pdf-viewer
npm test -w @anyfile/excel-viewer
```
