# 现代图片查看器 (`modern-raster`)

## 基本介绍

- **插件 ID**：`modern-raster`
- **格式入口**：`.jxl`、`.heic`、`.heif`、`.heifs`、`.hif`

支持 JPEG XL（JXL）和基于 HEVC 的 HEIF/HEIC，提供静态图片查看、JXL 动画播放、缩放、旋转和适应窗口。

## 实现原理

插件先读取最多 1 MiB 文件头识别格式。JXL 优先使用浏览器 `ImageDecoder`，不可用时在专用 Worker 中加载 WASM 解码器；HEIC 先尝试原生解码，再由独立 Worker 加载同源 libheif WASM 回退。所有结果转换为位图后交给 Canvas 视口显示。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `jxl-oxide-wasm@0.12.6` | JPEG XL 的 Worker/WASM 解码回退 |

`jxl-oxide-wasm@0.12.6` 用于 JXL Worker 回退；同源 `libheif 1.23.2 + libde265 1.1.1` 用于 HEIC 回退，审核产物位于 [third_party/heif-wasm/1.23.2-anyfile.1](../../../third_party/heif-wasm/1.23.2-anyfile.1/)，构建配方位于 [tools/heif-wasm-build](../../../tools/heif-wasm-build/)，运行时不使用 CDN。

## 已知限制

- JXL 输入最大 256 MiB、动画最多 4096 帧；HEIC 原生路径最大 256 MiB，WASM 回退最大 128 MiB；两者解码后均不得超过 64 Mi 像素。
- HEIC 只显示主图像，不提供辅助图像、序列或容器内多图导航。
- HEIC WASM 回退输出变换后的 straight-alpha RGBA8：NCLX/无 profile 图片转为 sRGB，ICC 只报告未应用，高位深/HDR 内容仅生成 SDR 预览。
- 原生解码能力和输出可能因浏览器而异；JXL probe 返回完整查看等级 4，HEIC 因上述语义缺失返回主要内容等级 3。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/modern-raster-viewer test
```
