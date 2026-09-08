# FFmpeg 视频查看器 (`ffmpeg-video`)

通过共享 FFmpeg Worker/WASM 运行时播放 AVI 中的 MPEG-4 Part 2 视频。

## 基本介绍

- **插件 ID**：`ffmpeg-video`
- **格式入口**：`.avi`
- **能力**：视频及主音频连续播放、暂停、进度跳转、音量控制。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 有界检查 AVI 流头，确认 MPEG-4 视频及 MP3 或无音频组合。
2. [src/index.ts](src/index.ts) 调用共享 `openFfmpeg(context, true, ...)`，交叉核对视频编码、尺寸和音频参数。
3. 共享运行时在 Worker 中解码，将视频帧送入显示队列、PCM 送入 Web Audio，并处理同步、跳转与销毁。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/ffmpeg-playback` | 共享 FFmpeg Worker/WASM 播放运行时 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

共享 FFmpeg 运行时统一管理资产、队列和许可证，详见[共享 FFmpeg 方案](../../../docs/videos/ffmpeg-playback-runtime-plan.md)。

## 已知限制

- 仅支持当前探测器接收的 AVI MPEG-4 Part 2 + MP3 或无音轨组合，不代表支持 AVI 中任意 codec。
- 要求 Worker、WebAssembly、VideoFrame 和 AudioContext；软件解码性能受设备影响。
- 视频队列上限 32 MiB、PCM 队列上限 8 MiB；组合及验证范围见[视频支持矩阵](../../../docs/videos/support-matrix.md)。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/ffmpeg-video-viewer test
```
