# EPUB 阅读器 (`epub-reader`)

解析无 DRM 的 EPUB 2/3 可重排电子书，提供目录和章节阅读。

## 基本介绍

- **插件 ID**：`epub-reader`
- **格式入口**：`.epub`
- **能力**：书名与作者、spine 阅读顺序、EPUB 3 nav / EPUB 2 NCX 目录、章节及内部链接导航。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/publication.ts](src/publication.ts) 检查 mimetype、container.xml 和 OPF，建立章节及资源索引。
2. [src/safe-content.ts](src/safe-content.ts) 按需读取章节并清理标记与资源，内容交给共享出版物视口。
3. [src/index.ts](src/index.ts) 管理 ZIP 会话、章节加载和销毁；资源只从书内受控路径读取。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/archive-metadata-viewer` | 复用电子书归档读取及 Worker 通信 |
| `@anyfile/browser-image-viewer` | 复用浏览器图片识别与解码 |
| `@anyfile/rendering-publication` | 电子书章节排版、内容清理与导航 |

ZIP 能力来自归档插件；章节清理、排版和导航复用 `@anyfile/rendering-publication`。

## 已知限制

- 不支持 DRM、字体混淆和固定布局；检测到 encryption.xml 或 rights.xml 即拒绝进入正文阅读。
- 仅接受单个 package document，正文 spine 需为 XHTML；脚本和外部主动内容不会执行。
- 最多 2000 章，XML/单章最多 2 MiB，结构节点、深度、字体和资源均有限额；不承诺完整出版级排版。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/epub-reader test
```
