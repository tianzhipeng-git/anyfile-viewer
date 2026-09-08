# FictionBook 阅读器 (`fictionbook-reader`)

将 FictionBook XML 转为章节和内嵌资源，在共享电子书视口中阅读。

## 基本介绍

- **插件 ID**：`fictionbook-reader`
- **格式入口**：`.fb2`、`.fb2.zip`、`.zip`
- **能力**：FB2 及包含单个 FB2 的 ZIP 包，支持章节目录、正文、内部锚点和内嵌图片。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/index.ts](src/index.ts) 根据文件名选择直接读取或 ZIP 解包，ZIP 内必须能选出唯一 FB2。
2. [src/encoding.ts](src/encoding.ts) 与 [src/publication.ts](src/publication.ts) 处理编码和 XML，建立章节、锚点及 binary 资源索引。
3. 正文经受控转换进入共享出版物视口；销毁时清空章节、图片和锚点缓存。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/archive-metadata-viewer` | 复用电子书归档读取及 Worker 通信 |
| `@anyfile/browser-image-viewer` | 复用浏览器图片识别与解码 |
| `@anyfile/rendering-publication` | 电子书章节排版、内容清理与导航 |

复用归档读取和出版物渲染；没有独立第三方 FB2 渲染器。

## 已知限制

- 解包后的 FB2 最大 32 MiB、最多 10 万结构节点、深度 64、2000 章；单章 2 MiB。
- 单图最多 8 MiB、1600 万像素；活动资源数量与总字节数受限。
- 不支持加密 ZIP，也不将任意多文件 ZIP 当作书库；不执行 XML 实体或书内脚本。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/fictionbook-reader test
```
