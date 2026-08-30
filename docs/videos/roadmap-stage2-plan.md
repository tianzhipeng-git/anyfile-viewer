# 阶段 2：通用非原生视频播放器

## Delivery Status（2026-08-30，已完成）

- 首批 Matroska 已完成：AVC/HEVC/VP8/VP9/AV1 + AAC/Opus/Vorbis/MP3/FLAC/video-only。
- 第二批 MPEG-TS 已完成：单 program 的 AVC/HEVC + AAC/MP3/video-only，覆盖 188-byte TS 与 192-byte M2TS 真实播放证据。
- 第三批普通 QuickTime 已完成：AVC + PCM S16LE、HEVC video-only；与原生 AVC/AAC MOV 按内容 probe 竞争。
- 第四批 Ogg Video 已完成：OGV.js 1.9.0 软件解码 Theora + Vorbis/Opus/video-only，Worker/WASM 仅在 Ogg 完整路径加载。
- AVI、MPEG-PS、MPEG-1/2 Video、AC-3/DTS 的依赖 spike 在阶段 2 内以“没有可直接接入的合适 provider”闭环；它们不是阶段 2 已声明范围，也不阻塞本阶段完成。阶段 2 完成后的产品决策是将受控 FFmpeg 播放 fallback 正式列为阶段 3，见 [FFmpeg 播放 fallback 接入方案](ffmpeg-playback-runtime-plan.md)。

## Summary

- 新增一个 `non-native-video` 插件，不为每种 codec 组合新建插件。
- 首要目标环境固定为 Chromium；其他浏览器以后按能力验证。
- 使用精确锁定的 Mediabunny 负责按需读取、demux、时间戳、seek 和 WebCodecs 解码接入；首期不引入 FFmpeg/WASM。
- 支持范围仍按“容器 × 视频 codec × 音频 codec”记录和验收，但这些组合共享同一个播放器内核。
- 第一批覆盖整个高价值 Matroska/WebCodecs 路径，而不是单个组合。

## Architecture

```text
non-native-video
├── 轻量 probe
│   ├── 容器识别
│   ├── 轨道与 codec 识别
│   └── 声明范围判定
├── container adapters
│   ├── Matroska（第一批）
│   ├── MPEG-TS（已交付）
│   ├── QuickTime（已交付普通组合）
│   ├── Ogg（已交付软件解码）
│   └── 其他容器（按需求增加）
├── decoder providers
│   ├── WebCodecs（第一批、Chromium）
│   └── OGV.js Theora/Vorbis/Opus WASM（按 Ogg 路径加载）
└── shared playback session
    ├── Canvas 视频输出
    ├── Web Audio 音频输出
    ├── AudioContext 主时钟与 A/V 同步
    ├── play / pause / seek / replay / volume
    ├── 有界预读和背压
    └── abort / dispose / decoder 与 GPU 资源释放
```

- `browser-video` 继续负责 `<video>` 可直接播放的文件；不改成自定义管线。
- `non-native-video` 负责“容器或播放路径不能直接交给 `<video>`，但轨道可由现有 decoder 解码”的文件。
- 将来增加软件 decoder 时优先作为 `non-native-video` 的延迟加载 provider；只有专业语义或完全不同的运行时边界才另建插件。
- 不提前创建跨插件公共媒体框架；播放核心先作为该插件内部模块拆分，避免单文件超过 600 行。

## First Delivery

- Manifest 首批增加 `.mkv`、`.mk3d`；与 `browser-video`、hex fallback 按 probe 等级稳定竞争。
- 第一批 Matroska 视频集合：
  - AVC/H.264
  - HEVC/H.265
  - VP8
  - VP9
  - AV1
- 第一批音频集合：
  - AAC
  - Opus
  - Vorbis
  - MP3
  - FLAC
  - 无音频的 video-only
- 插件不把上述集合机械展开成多个实现；读取实际轨道配置，通过 Mediabunny/WebCodecs 的具体 decoder config 判断当前文件能否解码。
- 只有视频轨道可解码、且文件应有的主音频也可解码时才返回等级 3；不能静默丢弃主音频。未知 codec、audio-only、损坏、超限或不完整索引返回 0 或对应准确错误。
- `open()` 初始化第一帧、音频链、seek 与清理路径后返回；不自动播放。播放必须由用户操作恢复 `AudioContext`。
- 首期支持单个主视频轨和与其配对的主音轨；多音轨选择、字幕、HDR 精确输出和专业色彩语义明确留在等级 3 的已知限制中。

## Resource and Loading Boundaries

- `manifest` 保持纯数据；probe 使用独立轻量、有界的 Matroska 轨道解析，不导入 Mediabunny、播放器 UI 或 decoder。
- Mediabunny 1.55.3 作为插件精确版本依赖，仅进入完整插件动态 chunk；使用 `BlobSource` 分片读取，不整体复制大文件。
- 首版设置并通过样例测量校准：
  - Blob 读取缓存上限；
  - 最大轨道数、EBML 深度和元素访问数；
  - 最大编码尺寸和像素数；
  - 最多保留当前帧与下一帧；
  - 音频最多预排约 1 秒；
  - seek 时取消旧 iterator、停止已排音频并从关键帧恢复。
- `dispose()` 统一停止播放、iterator、音频节点、AudioContext、Input、动画帧、定时器、事件、Canvas/GPU 帧和 DOM；重复调用安全。
- 首包、manifest、probe chunk 和无关插件 chunk 不得包含 Mediabunny 或播放器实现。

## Expansion Strategy

- Matroska 管线稳定后，新增格式主要是增加 container adapter、probe 识别和组合证据，不复制播放器：
  1. MPEG-TS：AVC/HEVC + AAC/MP3 已完成；未声明 codec 与多 program/多音轨语义按需求继续扩展；
  2. Ogg：Theora + Vorbis/Opus/video-only 已通过 OGV.js 软件解码交付；
  3. MOV 中 AVC/HEVC + PCM S16 或 video-only 已交付；
  4. AVI、MPEG-PS：Mediabunny 当前不直接覆盖；阶段 2 的依赖 spike 已结束，转入阶段 3 的独立 FFmpeg 播放 fallback；
  5. AC-3、DTS、MPEG-2 等 Chromium 原生 decoder 缺口，作为阶段 3 的具体容器 × codec 组合逐批验收；Theora 已由 OGV.js 路径交付。
- 新增 codec provider不得进入其他 codec 的加载路径；例如打开 MKV/AVC/AAC 时不能下载 AC-3 或 MPEG-2 decoder。
- ProRes、DNx、MXF、timecode 等仍留给阶段 4 `professional-video`，不因阶段 3 引入 FFmpeg decoder 就自动宣称支持。

## Test Plan

- 为每个视频 codec 和音频 codec 准备参数明确、可再生成的 MKV 样例，并覆盖主要高频配对；同一通用数据路径不要求无意义地穷举所有笛卡尔积，但支持矩阵只声明有端到端证据的组合。
- 固定覆盖：正常含音频、video-only、audio-only、损坏、截断、伪装扩展名、不支持 codec、异常时间戳、无关键帧索引和资源超限。
- Chromium 真实播放验收：首帧、连续播放、非静音音频、A/V sync、暂停恢复、前后 seek、结束、重播、窄/矮窗口和 resize。
- 生命周期验收：opening abort、active abort、快速连续 seek、切换文件、后台解码错误和重复 dispose 后无声音、任务、回调或资源残留。
- 运行协议测试、插件测试、`pnpm test`、`pnpm lint`、`pnpm build`，并扩展 bundle 门禁检查 Mediabunny 只存在于 `non-native-video` 完整实现 chunk。
- 本机ffpmeg命令可用于开发和调试过程

## Assumptions

- 第一目标环境为 Chromium，运行时仍以实际 track decoder config 为准；缺少所需 WebCodecs 能力时返回 `unsupported-environment`。
- 第一批追求“一个通用 MKV 播放管线覆盖多种 Chromium 可解 codec”，不是为每个组合复制实现。
- 阶段 2 不自行构建通用 FFmpeg/WASM；OGV.js 使用锁定的上游预构建 Ogg 专用资产。后续阶段 3 另行构建只播放、按需加载且按组合声明的 FFmpeg fallback，不回写为阶段 2 能力。
- Mediabunny 的 MPL-2.0 许可证与项目分发方式可接受，并保留版权与许可证要求。
