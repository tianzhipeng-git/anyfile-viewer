# 非原生视频查看器 (`non-native-video`)

在浏览器本地播放 Matroska、MPEG-TS、部分 QuickTime 与 Ogg Theora 视频。

## 基本介绍

- **插件 ID**：`non-native-video`
- **格式入口**：`.mkv`、`.mk3d`、`.ts`、`.mts`、`.m2ts`、`.m2t`、`.mov`、`.qt`、`.ogv`、`.ogg`
- **能力**：连续视频与主音频播放、暂停、进度跳转；也支持声明范围内的无音轨视频。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 与容器检查模块独立于完整播放器。MPEG-TS 探测验证 PAT、PMT、CRC 与 PES 证据。
2. Matroska、MPEG-TS 和 QuickTime 使用 Mediabunny 按需读取 Blob，结合 WebCodecs、Canvas 和 Web Audio 播放。
3. Ogg Theora 使用独立按需加载的 OGV.js 软件解复用及解码路径；仅部署需要的 Ogg Worker/WASM 与许可证。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `mediabunny@1.55.3` | 媒体容器读取、轨道访问与解码接口 |
| `ogv@1.9.0` | Ogg Theora 软件解复用与解码 |

完整播放路径才加载 `mediabunny` 或 `ogv`，Manifest 与轻量探测不加载重型运行时。

## 已知限制

- Matroska 当前覆盖 AVC、HEVC、VP8、VP9、AV1 及 AAC、Opus、Vorbis、MP3、FLAC 主音频的已实现组合，不应将两组 codec 理解为任意笛卡尔积。
- MPEG-TS 覆盖单路 AVC/HEVC 视频搭配 AAC、MP3 或无音频；QuickTime 覆盖 AVC/HEVC 搭配 16-bit PCM 或无音频，原生 AVC/AAC 由 browser-video 处理。
- Ogg 覆盖一路 Theora 搭配 Vorbis、Opus 或无音频；WebCodecs 路径优先面向 Chromium，兼容性和高级语义缺失见[视频支持矩阵](../../../docs/videos/support-matrix.md)。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/non-native-video-viewer test
```
