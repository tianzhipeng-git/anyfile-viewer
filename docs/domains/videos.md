# 视频查看与共享 FFmpeg 运行时架构及支持矩阵

本文件记录视频查看器分族、`<video>` 生命周期规则、共享 `@anyfile/ffmpeg-playback` 运行时契约及组合级支持矩阵。各插件细节与测试命令见 `viewer/plugins/{browser-video,non-native-video,ffmpeg-video,insta360,dji-osmo,gopro-max}/README.md`。

## 1. 核心原则与插件分族

- **支持粒度与交付底线**：按 `容器 × 视频 codec/profile/bit-depth × 音频 codec × 时间轴 × 环境` 计量。仅等级 3 以上（主视频连续播放、应有主音频可用、基础 seek、准确错误与完整释放）视为视频支持；不建仅看元数据或首帧的视频插件。
- **明确排除**：纯音频文件（视频 probe 必须返回 0，attached picture 不算主视频）、流媒体协议（HLS/DASH/RTMP）、DRM、录制/转码/剪辑、DVD/Blu-ray 目录结构。
- **Probe 约束**：probe 不得调用 `canPlayType()`（HEVC MP4 与 AVC MOV 存在假阴性）或创建媒体元素；真实环境解码失败由 `open()` 返回 `unsupported-environment`。
- **`<video>` 生命周期**：`open()` 等待 `loadeddata` 而非仅 `loadedmetadata`；幂等 `dispose()` 必须按序执行：标记失效 → `pause()` → 移除监听 → 清空 `src`/`<source>` → `load()` → 撤销 Object URL → 移除插件根节点。

### 插件分族与预算

| 插件 | 负责范围 | 关键预算与技术栈 |
|---|---|---|
| `browser-video` | 原生 MP4 / WebM / MOV / 3GPP | probe ≤256 KiB 头 + 256 KiB 尾（512 KiB 总量，不重读重叠区）、深度 ≤12、≤32 轨、≤4,096 项 |
| `non-native-video` | Matroska / MPEG-TS / M2TS / MOV(PCM/HEVC) / Ogg Theora | MKV probe 512+256 KiB、TS probe 512 KiB（单 program）；Mediabunny 1.55.3（8 MiB Blob 缓存、2 Canvas 槽、~1 s 音频预排、≤8192 边 / 33,554,432 px）；Ogg Theora 独立按需加载 OGV.js 1.9.0 |
| `ffmpeg-video` | AVI / MPEG-PS / VOB / ASF / WMV 等软件回退 | 共享 `@anyfile/ffmpeg-playback`，见第 2 节 |
| 全景视频 | `insta360`（`.insv`/`.lrv`）、`dji-osmo`（`.osv`）、`gopro-max`（`.360`） | 机型/布局严格 probe；WebCodecs + WebGL 投影；Insta360 双轨 HEVC 支持 FFmpeg `openPanorama` 软件回退 |

## 2. 共享 `@anyfile/ffmpeg-playback` 运行时

服务 `ffmpeg-video`、`ffmpeg-audio` 及 `insta360` 双轨 HEVC 软件回退。构建配方与基准测试命令见 [tools/ffmpeg-playback-build/README.md](../../tools/ffmpeg-playback-build/README.md)。

- **构建版本**：`9.0.1-anyfile.4`（FFmpeg 9.0.1 LGPL-2.1-or-later 解码专用构建 + Emscripten 4.0.10，启用 `-msimd128 -pthread`）。禁用全部网络/URL 协议、编码器、复用器与外部自动探测；仅经 WORKERFS `/input/media` 与自定义 AVIO 分段读取本地文件。
- **分发与回退**：Worker 与胶水脚本（兼 pthread 入口）**始终同源**；WASM 走 `https://assets.anyfile.top/vendor/ffmpeg-playback/9.0.1-anyfile.4/` → 同源回退（仅限获取/初始化失败，文件错误不回退）。构建门禁要求 WASM 压缩体积 ≤5 MiB gzip。
- **会话与资源预算**：
  - WASM 堆 32 MiB 初始 / 512 MiB 上限；单次 FFmpeg 分配 ≤64 MiB；包/输出缓冲 ≤16 MiB；demux ≤8 轨 / 4 MiB 索引；单命令 ≤32 MiB 读取 / 8,192 步；C 超时 10 s、watchdog 15 s、初始化 10 s。
  - **常规模式**（单线程解码）：视频 ≤1080p（2,073,600 px）、队列 ≤16 帧 / 32 MiB；音频 1–2 ch 8–96 kHz、PCM 帧 ≤65,536 样本/声道、队列 ≤64 源 / 8 MiB（~0.5 s）。MPEG-PS seek 采用 1/2/4/8/16 s 回退窗口与 512 包重同步。
  - **全景模式 (`openPanorama`)**：双轨 3840² HEVC 8-bit 4:2:0 BT.709 + AAC → 双轨 1920² BT.709 limited-range I420；每镜头 2 个帧线程（固定 4-Worker pthread 池，需 `SharedArrayBuffer` 与跨源隔离）；显示队列 ≤256 MiB / 每轨 128 事件；起播/恢复缓冲 0.5 s、预取 0.7 s、暂停预览 0.1 s。不保证实时播放。

## 3. 组合级支持矩阵

除特别注明外，已验证组合的浏览器基线为 Chromium / macOS Apple Silicon；Safari、Firefox、Windows 与移动端覆盖仍待补证。

| 容器/组织 | 视频 | 音频 | 插件 | 等级 | 状态 | 备注 |
|---|---|---|---|---:|---|---|
| MP4（头/尾 `moov`） | AVC / HEVC `hvc1` / AV1 `av01`（8-bit 4:2:0） | AAC-LC 或无音频 | `browser-video` | 3 | verified | — |
| WebM | VP8 / VP9（8-bit 4:2:0） | Vorbis / Opus 或无音频 | `browser-video` | 3 | verified | WebM AV1+Opus 待计划 |
| QuickTime / MOV | AVC + AAC | AAC-LC | `browser-video` | 3 | verified | — |
| QuickTime / MOV | AVC + PCM `sowt`；HEVC video-only | PCM S16LE 或无音频 | `non-native-video` | 3 | verified | 不抢占原生可播 AVC+AAC |
| 3GPP | AVC Baseline | AAC-LC | `browser-video` | 3 | verified | H.263/AMR 待规划 |
| Matroska（有 Cues） | AVC / HEVC / VP8 / VP9 / AV1 | AAC / FLAC / Vorbis / Opus / MP3 或无音频 | `non-native-video` | 3 | verified | 单主视频 + 至多单主音频 |
| MPEG-TS / M2TS（188/192 B 单 program） | AVC / HEVC | AAC / MP3 或无音频 | `non-native-video` | 3 | verified | 204 B 仅 probe 识别；MPEG-2/AC-3/多 program 待规划 |
| Ogg Video | Theora | Vorbis / Opus 或无音频 | `non-native-video` | 3 | verified | OGV.js 1.9.0 按需加载 |
| AVI（单 RIFF + `idx1`） | MPEG-4 Part 2 (`FMP4`/`XVID`/`DIVX`/`DX50`/`MP4V`) ≤1080p | MP3 或无音频 | `ffmpeg-video` | 3 | implemented | 不支持 OpenDML 与多主轨 |
| MPEG-PS / VOB | MPEG-2 Video（含 sequence extension）≤1080p | AC-3 或 MP2 单音轨 | `ffmpeg-video` | 3 | verified | 拒绝 MPEG-1 视频、DTS/LPCM 与多音轨 |
| ASF / WMV | WMV2 ≤1080p | WMA2 或无音频 | `ffmpeg-video` | 3 | verified | 拒绝加密流、WMV1/VC-1 与 WMA1 |
| Insta360 X3 成对 `.insv` | 双文件 `_00`/`_10` 2880² AVC | AAC-LC（`_00` 主时钟） | `insta360` | 3 | verified | 需工作区配对；无 gyro/FlowState |
| Insta360 X4/X5/X6 单文件 `.insv` | 双轨 3840² HEVC | AAC-LC | `insta360` | 3 | verified / implemented | WebCodecs 优先 → FFmpeg 1920² 软件回退 → 1280×640 静态回退 |
| DJI Osmo 360 `.osv` | 双轨 3840² HEVC Main 10 | AAC-LC | `dji-osmo` | 3 | implemented | 忽略 `djmd`/`dbgi` 与 MJPEG 缩略轨；待真实浏览器复验 |
| GoPro MAX / MAX2 `.360` | 双轨 EAC HEVC（4096×1344 / 5952×1920） | AAC-LC | `gopro-max` | 3 | implemented | 忽略 4ch Ambisonic PCM；待真实浏览器复验 |
| Flash Video (`.flv`) | Sorenson / VP6 / AVC | AAC / MP3 | `ffmpeg-video` | 0 | deferred | `ffmpeg-playback` 已编入 demuxer/decoder，待补 probe/样例/注册 |
| MOV ProRes / MXF | ProRes / DNx / AVC-Intra 等 | PCM | 专业视频（未立项） | 0 | deferred | 需独立规划，不因 FFmpeg 存在而自动声明 |

## 4. 已知缺口

- 跨浏览器（Firefox/Safari/Windows/移动端）长时播放验证。
- 高级播放语义：VFR、旋转元数据完整矩阵、多音轨/字幕选择、HDR 色彩准确输出。
