# 浏览器音频查看器 (`browser-audio`)

通过浏览器原生音频元素播放本地音频，并展示音频元数据和可视化效果。

## 基本介绍

- **插件 ID**：`browser-audio`
- **格式入口**：`.mp3`、`.wav`、`.wave`、`.m4a`、`.mp4`、`.ogg`、`.oga`、`.opus`、`.webm`、`.flac`、`.fla`、`.aac`、`.adts`
- **能力**：播放、暂停、进度跳转、音量控制，支持频谱与波形切换。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/inspect.ts](src/inspect.ts) 检查容器和编码，复用视频插件的有界容器读取能力。
2. [src/index.ts](src/index.ts) 为文件创建 Object URL，使用 `<audio>` 加载；打开阶段不创建音频图或自动发声。
3. 首次由用户发起播放后，共享 `AudioVisualizer` 连接媒体元素；销毁时释放可视化、媒体元素和 URL。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/browser-video-viewer` | 复用 ISO BMFF / WebM 容器检查 |
| `@anyfile/non-native-video-viewer` | 复用非原生媒体容器检查 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |

不引入第三方音频解码器；原生媒体播放与 Web Audio 可视化分开初始化。

## 已知限制

- 当前入口覆盖 MPEG-1 Layer III MP3；WAVE 的 16/24-bit 整数及 32-bit 浮点 PCM；M4A/MP4 和 ADTS 的 AAC-LC；Ogg/WebM 的单轨 Opus/Vorbis；16/24-bit FLAC。
- WAVE/FLAC 为单声道或双声道、采样率不高于 192 kHz；WebM 要求探测到 Cues 索引，M4A/MP4 不能包含视频轨道。
- 实际播放受浏览器原生解码能力影响；完整组合和验证环境见[音频支持矩阵](../../../docs/audio/support-matrix.md)。
- 可视化为实时播放效果，不提供完整文件的离线波形分析或音频编辑。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/browser-audio-viewer test
```
