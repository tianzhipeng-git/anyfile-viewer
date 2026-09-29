# 浏览器图片查看器 (`browser-image`)

## 基本介绍

- **插件 ID**：`browser-image`
- **格式入口**：`.jpg`、`.jpeg`、`.jpe`、`.jfif`、`.jif`、`.jfi`、`.pjpeg`、`.pjp`、`.png`、`.apng`、`.gif`、`.webp`、`.avif`、`.heif`、`.heifs`、`.hif`、`.bmp`、`.dib`、`.ico`、`.cur`

支持 JPEG、PNG/APNG、GIF、WebP、AVIF、BMP/DIB 和 ICO/CUR，并提供缩放、旋转、适应窗口及动画查看。

## 实现原理

插件最多读取前 1 MiB 文件头识别格式和基础元数据，再为原始 `File` 创建 Object URL，交给浏览器 `<img>` 解码。静态图片继续由浏览器负责 EXIF 方向和可用的色彩管理。GIF、APNG、动画 WebP 与 AVIF 在 ImageDecoder 支持时动态加载可控动画模块，按索引解码完整合成帧并绘制至 Canvas；不支持时仍使用原生图片预览并提示限制。详见 [动画查看说明](ANIMATION.md)。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

没有第三方解码器或运行时网络请求，原始图像由浏览器解码。

## 已知限制

- `.heif`、`.heifs`、`.hif` 是候选扩展名；本插件识别其中的 AVIF 内容，HEVC 编码的 HEIF/HEIC 由 modern-raster 处理。
- 静态原生预览不设置固定输入大小上限。可控动画限制输入 128 MiB、单边 8192 像素、单帧 16 Mi 像素、所有帧合计 64 Mi 像素及 10,000 帧。
- BMP/DIB、ICO/CUR 和 AVIF sequence 的支持存在浏览器差异，probe 对这些格式保守返回主要内容等级 3。
- 原生回退只检查前 1 MiB，超出范围的动画信息可能不完整；可控动画读取完整的有界输入后使用解码器帧数。
- 不提供帧导出、像素级检查或独立于浏览器的统一色彩输出。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/browser-image-viewer test
```
