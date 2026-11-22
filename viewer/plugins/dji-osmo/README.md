# DJI Osmo 全景查看器 (`dji-osmo`)

针对已验证的 DJI Osmo 360 布局，提供本地交互式全景查看与播放。

## 基本介绍

- **插件 ID**：`dji-osmo`
- **格式入口**：`.jpg`、`.jpeg`、`.osv`
- **能力**：Osmo / OQ001 的 15520×7760 GPano 等距柱状 JPEG（等级 5）；OSV 双 3840×3840 HEVC Main 10 鱼眼轨道及 AAC 48 kHz 双声道音频（等级 3）。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 按内容有界探测：JPEG 严格校验 15520×7760、EXIF `Osmo`/`OQ001` 与 GPano 等距柱状元数据；OSV（`ftyp→free→free→mdat(64-bit)→moov→camd`）读 64 KiB 头部并用顶层 box 长度定点跳转读取 ≤2 MiB `moov`，校验 `OQ001`/`Osmo 360`/`djmd`/`dbgi` 及双 3840² HEVC + AAC 轨道，忽略私有数据轨与 MJPEG 缩略轨。
2. JPEG 按 `min(8192, WebGL MAX_TEXTURE_SIZE)` 保持 2:1 比例解码；OSV 使用 Mediabunny `BlobSource`（8 MiB 缓存）分段读取、WebCodecs 解码（每路 2 个 `CanvasSink` 槽）、Web Audio 主时钟（~1 s 预排）及 WebGL 片元着色器双鱼眼直接混合采样，不复制整文件或生成中间等距视频。
3. 进度条拖动松手后才提交解码，seek 严格串行并丢弃过期请求；双镜头焦距、光心、旋转（`thetaMax=100°`、`blend=8°`）基于三份真实 OQ001 样例跨镜头重叠带拟合标定。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/browser-video-viewer` | 复用 ISO BMFF / WebM 容器检查 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `mediabunny@1.55.3` | 媒体容器读取、轨道访问与解码接口 |

全景投影与媒体会话复用共享渲染包，Mediabunny 仅用于完整媒体实现。

## 已知限制

- 当前范围以已验证机型和轨道布局为限，不代表任意 DJI 视频。
- 未应用陀螺仪稳定、DJI 私有元数据或 HDR 精确输出。
- DJI OP-041 DNG 是普通 Osmo Pocket RAW 照片，由 camera-raw 处理；HEVC 解码依赖浏览器和设备。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/dji-osmo
```
