# MOBI / Kindle 阅读器 (`mobi-reader`)

在浏览器中解码无 DRM 的 MOBI、KF8 和 PalmDOC 电子书。

## 基本介绍

- **插件 ID**：`mobi-reader`
- **格式入口**：`.mobi`、`.azw`、`.azw3`、`.prc`、`.pdb`
- **能力**：MOBI/Kindle 与 Palm 数据库入口，提供正文、目录和书内资源阅读。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 检查 Palm 数据库记录、压缩类型和 MOBI 头部，提前识别受保护或不支持的内容。
2. [src/decoder.worker.ts](src/decoder.worker.ts) 加载同源 libmobi WASM 解码；主线程通过 Worker 请求读取书内资源。
3. [src/publication.ts](src/publication.ts) 转换解码结果，交给共享出版物视口；销毁时终止 Worker。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/archive-metadata-viewer` | 复用电子书归档读取及 Worker 通信 |
| `@anyfile/browser-image-viewer` | 复用浏览器图片识别与解码 |
| `@anyfile/rendering-publication` | 电子书章节排版、内容清理与导航 |

额外按需加载 `/vendor/libmobi/0.12-anyfile.1/mobi.js` 及其 WASM；部署需包含对应审核资产和许可证。

## 已知限制

- 输入最多 64 MiB，声明文本最多 32 MiB，最多 10,000 记录，单记录最多 16 MiB。
- 不支持 DRM、词典或 Print Replica；`.pdb`、`.prc` 仅接受符合书籍结构的内容。
- 要求 Worker、WebAssembly 和 ResizeObserver；不能将旧版 Kindle 排版等同于现代浏览器的完全还原。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/mobi-reader test
```
