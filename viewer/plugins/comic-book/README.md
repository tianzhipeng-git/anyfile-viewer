# 漫画阅读器 (`comic-book-reader`)

从漫画归档中按页读取图片，在浏览器本地阅读。

## 基本介绍

- **插件 ID**：`comic-book-reader`
- **格式入口**：`.cbz`、`.cbr`、`.cb7`、`.cbt`
- **能力**：CBZ、CBR、CB7、CBT；自然文件名排序、单页/跨页阅读及 ComicInfo 阅读方向信息。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/archive-source.ts](src/archive-source.ts) 将 CBZ 路由到 ZIP、CBT 路由到 TAR，CBR/CB7 按需加载压缩归档 Worker。
2. [src/model.ts](src/model.ts) 筛选 JPEG、PNG、GIF、WebP、AVIF 图片，跳过隐藏路径，并解析 ComicInfo.xml 的封面、跨页和 RTL 信息。
3. [src/viewport.ts](src/viewport.ts) 按需读取、解码和回收页面，最多保留 5 个活动页面。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/archive-metadata-viewer` | 复用电子书归档读取及 Worker 通信 |
| `@anyfile/browser-image-viewer` | 复用浏览器图片识别与解码 |

CBR/CB7 额外使用源码构建的 libarchive Worker/WASM；ZIP 和图片能力复用已有插件的专用导出。

## 已知限制

- 最多 5000 页、单页编码数据 16 MiB、单页 800 万像素；归档读取还有独立解压和条目限制。
- 不支持加密归档；图片解码取决于浏览器，不包含 OCR 或文本提取。
- CBR/CB7 压缩输入最大 64 MiB，需要部署 `/vendor/comic-archive/3.8.9-anyfile.1/` 下的 libarchive WASM 资产；不提供归档提取或编辑。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/comic-book-reader test
```
