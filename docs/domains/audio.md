# 音频查看架构及支持矩阵

本文件记录音频查看器的插件边界、`<audio>` 与可视化器不变量、资源预算和组合级支持矩阵。各插件细节与测试命令见 `viewer/plugins/{browser-audio,non-native-audio,ffmpeg-audio}/README.md`。

## 1. 架构与路由边界

- **交付底线**：按 `容器/裸码流 × codec/profile/sample format × 声道` 计覆盖，仅等级 3 以上（主音频可连续播放、基础 seek、准确错误、干净释放）视为音频格式交付；仅展示元数据、封面或波形不计为音频支持。
- **插件分族与路由**：`browser-audio`（原生 `<audio>`）→ `non-native-audio`（Mediabunny 软件/WebCodecs PCM）→ `ffmpeg-audio`（共享 `@anyfile/ffmpeg-playback` 解码，架构见[视频与 FFmpeg 文档](videos.md#2-共享-anyfileffmpeg-playback-运行时)）。
- **与视频互斥**：含主视频节目的 MP4/WebM/Ogg/ASF 容器，音频 probe 必须返回 0；attached picture（内嵌封面）不算主视频。
- **不信任 `canPlayType()`**：probe 只做有界容器/码流结构检验，不调用 `canPlayType()` 或创建媒体元素；真实环境无法解码由 `open()` 报告 `unsupported-environment`。
- **包隔离**：音频可视化通过 `@anyfile/viewer-rendering/audio` 独立子入口导入，不得污染图片或查看页首包。

## 2. `<audio>` 与 `AudioVisualizer` 不变量

1. **`open()` 不得抢占或静默破坏播放**：`open()` 不自动播放、不等待用户手势、不提前创建 `AudioContext` 或绑定 `createMediaElementSource()`。
2. **仅在用户点击 `play` 时延迟接入可视化**：先 `resume()` 并确认 `audioContext.state === "running"` 后再调用 `createMediaElementSource()`；若失败则立即关闭上下文并放弃可视化，确保原生 `<audio>` 绝不被静音。
3. **音频图拓扑**：必须先直连 `source → destination`，`AnalyserNode` 仅作旁路分支（自定义 PCM 路径通过 `node` 模式挂在 `#gain` 上，不接管或关闭调用方的 `AudioContext`）。
4. **可访问性**：可视化画布支持点击与 Enter/Space 切换频谱/波形；插件必须手动为画布设置 `role="button"`、`tabindex="0"`、本地化 `aria-label`/`title` 及 `:focus-visible` 样式（详情见 [audio-visualizer.md](../../viewer/rendering/audio-visualizer.md)）。
5. **静音合法**：真实静音音频是有效播放；非静音固定样例在浏览器验收中验证输出链路产生非静音信号。

## 3. Probe 与播放资源预算

- **Probe**：头/尾最多 256 KiB / 64 KiB；MP3 跳过 ID3/APIC synchsafe 标签后扫描 ≤4 KiB / 16 偏移；FLAC 最多跳过 128 个 metadata block（跳过 picture 载荷）；Matroska probe ≤32 轨 / open ≤16 轨。
- **自定义解码路径**：采样率 ≤192 kHz（FFmpeg 路径 8–96 kHz）、≤2 声道、时长 ≤24 h；Mediabunny Blob 缓存 8 MiB、单 PCM 缓冲 ≤2 s / 8 MiB、预排 ~1 s；FFmpeg PCM 队列 ≤64 源 / 8 MiB（~0.5 s）。

## 4. 组合级支持矩阵

当前已实现组合均在 Chromium 完成验证，Firefox / Safari / Edge 跨浏览器覆盖仍待补证，因此统一记为 `implemented`。

| 容器/码流 | codec / sample format | 配置 | 插件 | 等级 | 状态 | 备注 |
|---|---|---|---|---:|---|---|
| MP3 | MP3 CBR / Xing VBR | 48 kHz stereo | `browser-audio` | 3 | implemented | VBRI 与其他 Layer/version 待补证 |
| RIFF/WAVE | PCM S16LE / S24LE / F32LE | 48 kHz stereo | `browser-audio` | 3 | implemented | — |
| RIFF/WAVE | A-law / μ-law | 8 kHz mono | `non-native-audio` | 3 | implemented | PCM 仍由 `browser-audio` 优先 |
| M4A/MP4 audio-only | AAC-LC | 48 kHz stereo | `browser-audio` | 3 | implemented | 与 MP4 视频互斥 |
| Ogg audio-only | Vorbis / Opus | 48 kHz stereo | `browser-audio` | 3 | implemented | 与 Theora 视频互斥 |
| WebM audio-only | Opus / Vorbis | 48 kHz stereo | `browser-audio` | 3 | implemented | 与 WebM 视频互斥 |
| native FLAC | FLAC 16/24-bit | 48 kHz stereo | `browser-audio` | 3 | implemented | 有界跳过 picture block |
| ADTS | AAC-LC | 48 kHz stereo | `browser-audio` | 3 | implemented | — |
| Matroska `.mka` | Opus / Vorbis / FLAC / AAC | 48 kHz stereo 单主轨 + seek index | `non-native-audio` | 3 | implemented | — |
| AIFF / AIFC `fl32` | PCM S16BE / S24BE / F32BE | 1–2 ch，8–96 kHz | `ffmpeg-audio` | 3 | implemented | — |
| ASF audio-only `.wma` | WMA v1 / v2 | 1–2 ch，8–96 kHz | `ffmpeg-audio` | 3 | implemented | 拒绝含视频流的 ASF |
| RIFF/WAVE | IMA/MS ADPCM | — | `ffmpeg-audio` | 0 | candidate | Mediabunny 明确不支持 ADPCM |
| M4A/MP4 audio-only | ALAC | 16/24-bit | `ffmpeg-audio` | 0 | planned | Mediabunny 1.55.3 不识别 `alac` |
| Ogg audio-only | FLAC | — | `ffmpeg-audio` | 0 | blocked | Mediabunny Ogg `getCodec()` 返回 null |
| M4A / ADTS | HE-AAC / AAC Main | — | `non-native` / `ffmpeg-audio` | 0 | blocked | 本机 FFmpeg 缺对应编码器生成固定样例 |
| APE / Musepack / AMR / AC-3 / DTS / AU / RA | 各编码 | — | `ffmpeg-audio` | 0 | candidate / deferred | 需分别评审专利、许可与解码成本 |

## 5. 明确排除与后续候选

- **不纳入音频播放范围**：MIDI、Tracker 模块、SoundFont、DRM、流媒体协议、编辑/转码/混音。
- **后续增强候选**：有界封面显示、多音轨/章节/CUE、gapless/encoder delay、ReplayGain/R128、歌词、多声道、BWF/ADM。
