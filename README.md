# Anyfile Viewer

一个 local-first 的浏览器文件查看器。

核心约定: 
- 文件在当前浏览器标签页中读取与预览，不上传到服务器。速度更快, 隐私更好。
- 只提供查看功能 不提供编辑。
- 文件使用 `showOpenFilePicker()`，目录使用 `showDirectoryPicker()`，拖放使用 `getAsFileSystemHandle()`；要求兼容的 Chromium 浏览器与 HTTPS/localhost 安全上下文。

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

当前查看器可直接预览图片、视频、PDF 与文本文件；其他格式等待按 `viewer-plugin-protocol.md` 接入专用插件。

## 验证

```bash
npm run lint
npm run build
```
