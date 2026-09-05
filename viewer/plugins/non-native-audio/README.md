# 非原生音频查看器 (`non-native-audio`)

使用 Mediabunny、WebCodecs 和 Web Audio 播放原生媒体路径未覆盖的音频组合。

## 基本介绍

- **插件 ID**：`non-native-audio`
- **格式入口**：`.mka`、`.wav`、`.wave`
- **能力**：Matroska 音频与 WAVE A-law / μ-law 的播放、暂停、进度跳转和音量控制。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 轻量识别容器与音轨；完整播放实现在选中插件后加载。
2. [src/media-inspection.ts](src/media-inspection.ts) 建立 Mediabunny 输入并选取可解码音轨；通过本地文件按需读取媒体数据。
3. [src/playback-session.ts](src/playback-session.ts) 将解码音频送入 Web Audio 调度，管理进度跳转、播放队列与资源释放。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/non-native-video-viewer` | 复用非原生媒体容器检查 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `mediabunny@1.55.3` | 媒体容器读取、轨道访问与解码接口 |

Mediabunny 随完整实现加载，探测路径复用轻量容器检查模块。

## 已知限制

- 打开阶段要求 `AudioDecoder` 和 `AudioContext`，实际 codec 能力仍取决于浏览器。
- `.mka` 覆盖 AAC、Opus、Vorbis、FLAC，必须只有一个主音轨且不含视频；WAVE 路径针对 A-law / μ-law，并使用 Mediabunny 软件 PCM 解码。
- 声道数最多 2，采样率 8–192 kHz，时长最多 24 小时；文件读取缓存和单个 PCM buffer 分别最多 8 MiB，单 buffer 时长最多 2 秒。
- 不提供转码、导出或任意多音轨混音；组合级范围见[音频支持矩阵](../../../docs/audio/support-matrix.md)。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/non-native-audio-viewer test
```
