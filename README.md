# Anyfile Viewer

一个 local-first 的浏览器文件查看器。

核心特点: 
- 文件在当前浏览器标签页中读取与预览，不上传到服务器。速度更快, 隐私更好。
- 只提供查看功能 不提供编辑, 要轻量、快、能打开大文件。
- 支持的文件格式 超级超级多 超级超级全

先阅读 核心的["格式查看器插件协议"文档](docs/viewer-plugin-protocol.md)

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

当前查看器通过 `viewer/` 下的统一协议动态加载 PDF 与 Excel（XLSX/XLSM）插件；其他格式可按 `viewer-plugin-protocol.md` 继续接入。

## 验证

```bash
npm test
npm run lint
npm run build
```

插件也可以独立测试：

```bash
npm test -w @anyfile/pdf-viewer
npm test -w @anyfile/excel-viewer
```
