# Photoshop 查看器 (`photoshop-document`)

读取 PSD/PSB 已保存的合成图，提供图像预览及文档信息。

## 基本介绍

- **插件 ID**：`photoshop-document`
- **格式入口**：`.psd`、`.psb`
- **能力**：缩放、旋转、适应窗口，查看尺寸、位深、色彩模式和图层数量。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/index.ts](src/index.ts) 读取头部，检查文件大小和像素预算，然后启动解码 Worker。
2. [src/decode.ts](src/decode.ts) 调用 ag-psd，跳过图层像素、缩略图和链接文件数据，读取合成图及图层元数据。
3. 16-bit/浮点像素转为 RGBA8，经 ImageBitmap 交给视口；销毁时释放位图和 Worker。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `ag-psd@31.0.2` | PSD/PSB 合成图与文档元数据解析 |

ag-psd 仅在完整插件路径使用，解码在专用 Worker 中完成。

## 已知限制

- 文件最大 256 MiB，图像最多 64 Mi 像素；解析器解码预算为 256 MiB。
- 需要可用的合成图；不重建图层混合效果，不提供图层编辑、智能对象编辑或 Photoshop 完整排版。
- 高位深内容仅转为 8-bit 预览，不能视为专业 HDR 或完整色彩管理输出。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/photoshop-viewer test
```
