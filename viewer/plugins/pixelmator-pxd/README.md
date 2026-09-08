# Pixelmator Pro 文档查看器 (`pixelmator-pxd`)

从 Pixelmator Pro 文档中提取内嵌预览，显示保存时的图像结果。

## 基本介绍

- **插件 ID**：`pixelmator-pxd`
- **格式入口**：`.pxd`
- **能力**：PXD 预览图、尺寸与编码信息，缩放、旋转和适应窗口。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/inspect.ts](src/inspect.ts) 检查 ZIP 结构及预览条目；打开时重新校验 metadata.info 的 SQLite 魔数。
2. [src/index.ts](src/index.ts) 仅提取 metadata.info 和选中的内嵌预览，不重建文档图层。
3. PNG/JPEG/WebP 由 createImageBitmap 解码；TIFF 按需导入通用栅格插件的 TIFF 解码器，再交给共享视口。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/general-raster-viewer` | 按需解码 TIFF 内嵌预览 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `@zip.js/zip.js@2.8.60` | ZIP 目录读取与所需条目解压 |

TIFF 解码按需复用 `@anyfile/general-raster-viewer/tiff`，不为普通 PNG/JPEG 预览加载 TIFF 路径。

## 已知限制

- 最多 10,000 个 ZIP 条目；metadata.info 最多 16 MiB，预览数据最多 64 MiB。
- 必须含有效元数据和可解码预览；不支持加密条目，也不将 SQLite 元数据作为完整 Pixelmator 文档模型解析。
- 仅代表保存的内嵌图像，不提供图层、效果或色彩调整的重新计算。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/pixelmator-pxd-viewer test
```
