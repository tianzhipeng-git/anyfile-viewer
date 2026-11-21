# FFmpeg 视频查看器 (`ffmpeg-video`)

通过共享 FFmpeg Worker/WASM 运行时播放浏览器与 macOS 原生打不开的视频容器。

## 基本介绍

- **插件 ID**：`ffmpeg-video`
- **格式入口**：`.avi`（MPEG-4 Part 2 + MP3）、`.wmv` / `.asf`（WMV2 + WMA2）、`.mpg` / `.mpeg` / `.vob`（MPEG-2 Video + AC-3/MP2）
- **能力**：视频及主音频连续播放、暂停、进度跳转、音量控制；无音轨文件不创建 AudioContext。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 依次调用各容器的有界解析器，返回唯一匹配的容器、主视频 codec、尺寸与主音频参数。
2. [src/probe-avi.ts](src/probe-avi.ts) 检查 RIFF 头、`idx1` 索引、MPEG-4 视频与单一 MP3 音轨；[probe-asf.ts](../../ffmpeg-playback/src/probe-asf.ts) 遍历 ASF Header Object 的 Stream Properties；[src/probe-ps.ts](src/probe-ps.ts) 沿 MPEG-1/2 pack 与 PES 链定位 MPEG-2 sequence header 与 AC-3/MP2 帧头。
3. [src/index.ts](src/index.ts) 调用共享 `openFfmpeg(context, true, ...)`，用探测结果交叉核对运行时报告的 video/audio codec、尺寸、声道与采样率，任一不符即拒绝。
4. 共享运行时在 Worker 中解码，将视频帧送入显示队列、PCM 送入 Web Audio，并处理同步、跳转与销毁。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/ffmpeg-playback` | 共享 FFmpeg Worker/WASM 播放运行时、有界读取与 ASF 结构解析 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

共享 FFmpeg 运行时统一管理资产、队列和许可证，详见[共享 FFmpeg 方案](../../../docs/videos/ffmpeg-playback-runtime-plan.md)。

## 已知限制

- 只支持上述声明的组合：AVI 需要 `idx1` 索引与单一主视频；ASF 仅 WMV2 + WMA2，且拒绝加密流、多视频轨或多音轨；MPEG-PS 仅 MPEG-2 主视频 + 单条 AC-3/MP2 音轨，MPEG-1 视频、DTS/LPCM、多音轨与字幕私有流不进入声明范围。
- 有界读取：ASF Header Object 最多 64 KiB，MPEG-PS 只看前 128 KiB，AVI 只按块读取头部与索引；超出窗口的结构不识别。
- 要求 Worker、WebAssembly、VideoFrame 和 AudioContext；软件解码性能受设备影响。
- 视频队列上限 32 MiB、PCM 队列上限 8 MiB；组合及验证范围见[视频支持矩阵](../../../docs/videos/support-matrix.md)。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/ffmpeg-video
```
