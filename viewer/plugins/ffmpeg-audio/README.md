# FFmpeg 音频查看器 (`ffmpeg-audio`)

通过共享 FFmpeg Worker/WASM 运行时播放 AIFF / AIFC PCM 音频。

## 基本介绍

- **插件 ID**：`ffmpeg-audio`
- **格式入口**：`.aif`、`.aiff`、`.aifc`
- **能力**：本地连续播放、暂停、进度跳转和音量控制。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 解析 AIFF/AIFC 头部，检查编码、声道、采样率和帧数。
2. [src/index.ts](src/index.ts) 调用共享 `openFfmpeg(context, false, ...)`，并核对真实解码信息与探测结果一致。
3. [共享播放运行时](../../ffmpeg-playback/src/index.ts) 管理 Worker、文件读取、PCM 队列、Web Audio 播放与销毁。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/ffmpeg-playback` | 共享 FFmpeg Worker/WASM 播放运行时 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

FFmpeg 资产和许可证由共享包管理，构建、裁剪及部署约束见[共享 FFmpeg 方案](../../../docs/videos/ffmpeg-playback-runtime-plan.md)。

## 已知限制

- 只支持大端有符号 16/24-bit PCM，以及 AIFC 的大端 32-bit 浮点 PCM；单声道或双声道，采样率 8–96 kHz。
- 依赖 Worker、WebAssembly 和 Web Audio；不是任意 FFmpeg 音频格式的通用入口。
- 运行时队列和操作超时受限，大文件的可播放性仍受解码吞吐与浏览器内存影响；见[音频支持矩阵](../../../docs/audio/support-matrix.md)。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/ffmpeg-audio-viewer test
```
