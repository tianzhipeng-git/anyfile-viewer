# 音频查看实施路线图

- 状态：阶段 0 已完成；阶段 1、2 已实现并通过 Chromium 端到端验证，Firefox/Safari/Edge 的完整环境矩阵仍待补证
- 范围：浏览器本地打开的独立音频文件与 audio-only 容器
- 产品结果：播放主要音频节目，不交付只能检查 metadata、封面、波形或代表性片段的音频插件
- 核心目标：满足播放和资源安全底线后，优先扩大可播放的容器/裸码流 × codec/sample format 组合

## 1. 总体原则

1. 浏览器原生 `<audio>` 能完成的组合不进入自定义解码管线；
2. Mediabunny + WebCodecs/PCM 能覆盖的明确缺口不等待 FFmpeg；
3. FFmpeg 只承接前两条路径未覆盖、用户价值和端到端成本均成立的组合；
4. 支持按组合和真实环境声明，不按扩展名或依赖理论能力声明；
5. audio-only 与视频容器共享扩展名时，通过有界内容 probe 精确分流；
6. 不自动播放，不上传，不整体复制大文件，不预解码完整 PCM；
7. 等级 3 是有效交付，不要求先完成 gapless、多轨、歌词、封面或 bit-perfect。

每个正式组合的最低门槛：

- 能识别一个明确主音频节目，并排除主视频节目；
- `open()` 取得真实可播放数据或首个有效 decoded PCM buffer；
- 连续播放、暂停、音量、前后/快速 seek、结束和重播可用；
- 用户手势前不发声；
- 缓冲、索引、标签、解码和内存工作量有边界；
- opening abort、active abort、切换和重复 dispose 完整清理；
- 损坏、不支持、环境缺失和资源超限准确分类。

## 2. 阶段 0：证据与边界

实现记录见[阶段 0–2 证据](roadmap-stage0-2-evidence.md)。固定语料、SHA-256、生成脚本、probe 测量脚本与资源门禁已经入库；当前 FFmpeg 构建没有 APE encoder，因此 APE spike 样例保持明确阻塞，不据此扩大支持声明。

目标是建立音频路线图所需的固定语料、原生媒体行为、probe 预算和资源门禁，不注册音频插件。

### 工作项

- 建立[格式候选清单](format-inventory.md)和[支持矩阵](support-matrix.md)；
- 准备 MP3、WAVE、M4A/MP4、Ogg、WebM/Matroska、FLAC、ADTS 的参数明确正常样例；
- 准备 AIFF、WMA、APE 的 FFmpeg spike 样例；
- 为适用容器准备 video 对照、attached picture、损坏、截断、伪装、超大 tag、无索引和资源超限反例；
- 用固定样例记录 `<audio>` 的真实加载、播放、暂停、非静音输出、seek、结束、重播和清理行为；
- 测量识别 codec、主音轨、VBR/index 和 video/attached-picture 分流所需的最小头尾读取量；
- 定义 tag bytes、metadata blocks、track count、scan frames、sample rate、channel count、duration 和 PCM 队列上限；
- 建立目标浏览器矩阵，记录 Chrome/Edge/Firefox/Safari 的完整版本、OS、硬件和日期。

### 固定语料最低集合

1. MP3 CBR、Xing/VBRI VBR、ID3v2/APIC 和尾部 ID3v1；
2. WAVE PCM S16LE、S24LE、F32LE 及不支持 ADPCM 对照；
3. M4A/MP4 AAC-LC audio-only、ALAC 对照和真实 MP4 视频对照；
4. Ogg Vorbis、Ogg Opus 和 Ogg Theora 视频对照；
5. WebM Opus audio-only、Matroska `.mka` 和 WebM 视频对照；
6. native FLAC 16/24-bit、含 picture block；
7. ADTS AAC-LC 与不同 profile 对照；
8. AIFF PCM、ASF/WMA、APE；
9. 每族损坏、截断、伪装和资源超限反例。

### 验收

- 文档口径一致，支持矩阵没有把候选写成已支持；
- 固定样例可再生成或来源/哈希/许可可审计；
- 原生环境证据区分 metadata loaded、真实可播放数据和实际输出；
- probe 预算来自测量，不沿用无依据的统一数字；
- 初始 `/view` bundle 不包含任何音频实现或 probe parser。

## 3. 阶段 1：browser-audio

已实现 `browser-audio` workspace 插件。当前声明范围为 MP3 CBR/Xing VBR、WAVE PCM S16LE/S24LE/F32LE、M4A/MP4 AAC-LC audio-only、Ogg Vorbis/Opus、WebM Opus/Vorbis audio-only、native FLAC 16/24-bit 和 ADTS AAC-LC；所有组合均已在当前 Chromium 环境取得真实媒体数据并完成非静音播放推进。

新增单一 `browser-audio` workspace 插件，使用 `<audio controls>` + Object URL。首批候选：

- MP3 CBR/VBR；
- WAVE PCM S16LE，按证据增加 S24LE/F32LE；
- M4A/MP4 audio-only AAC-LC；
- Ogg Vorbis/Opus；
- WebM audio-only Opus/Vorbis；
- native FLAC；
- ADTS AAC-LC（仅在目标环境真实播放证据成立时）。

### 插件要求

- manifest、probe、完整实现保持独立入口；
- manifest 只列阶段 1 实际安排 probe 的扩展名，不使用 `"*"`；
- probe 有界识别容器/帧、主音轨、声明 codec 子集、video program 和基础 seek 证据；
- `.mp4`、`.webm`、`.ogg` 中存在主视频节目时返回 0，attached picture 不算主视频；
- `open()` 独立复验内容，不信任 probe；
- 不依赖 `canPlayType()` 判定成功，等待当前文件真实媒体数据；
- 不 autoplay，不创建 AudioContext；
- 原生 controls 负责播放、暂停、音量、seek 和无障碍；
- dispose 幂等释放媒体资源、监听、Object URL 和 DOM。

### 阶段 1 验收

- 每个声明组合有固定样例和目标浏览器真实播放证据；
- video 对照、损坏、截断、伪装、超限和不支持组合 probe 0 且 `open()` 准确拒绝；
- VBR 时长、前后/快速 seek、结束和重播通过；
- 很窄/很矮窗口仍可使用 controls；
- opening abort、active abort、连续切换和重复 dispose 无残留声音、URL、监听或 DOM；
- `/view` 首包不包含完整插件或 probe parser。

## 4. 阶段 2：non-native-audio

已实现 `non-native-audio` workspace 插件，首个完整 vertical slice 为带安全 seek index 的单主音轨 `.mka`，声明 Opus、Vorbis、FLAC 与 AAC。Mediabunny 只存在于完整实现 chunk；`open()` 在不创建 `AudioContext` 的前提下解码首个 PCM buffer，首次播放手势才建立 Web Audio 输出链。

新增单一 `non-native-audio` workspace 插件，承接浏览器媒体元素不能稳定播放、但 Mediabunny 能分片 demux且 PCM/WebCodecs 能解码的明确组合。

首批 spike 候选：

- `.mka` Matroska audio-only 的 Opus、Vorbis、FLAC、AAC 子集；
- 原生路径失败但 Mediabunny PCM 能安全输出的 WAVE 变体；
- 原生路径失败但目标环境 `AudioDecoder` 能解码的 ADTS、Ogg、FLAC、M4A/WebM 具体组合。

不是所有 Mediabunny `ALL_FORMATS` 或 codec enum 都进入 manifest。每一组合仍需独立 probe、`track.canDecode()`、首 buffer、seek 和真实输出证据。

### 播放管线

```text
BlobSource（有界缓存）
  → Input（显式 format）
  → 主音轨与时长/seek
  → AudioBufferSink
  → 最多约 1 秒 PCM lookahead
  → AudioContext / GainNode / AudioBufferSourceNode
```

### 阶段 2 要求

- `open()` 解码首个有效 buffer 并建立 UI/清理链后返回；首 buffer 可以是静音；
- 用户点击播放后才创建或恢复 AudioContext；
- 音频时钟、暂停、seek generation、结束和重播不依赖视频 Canvas；
- seek 停止旧 source、取消旧 iterator，并从新时间点恢复；
- 限制 Blob cache、轨道、采样率、声道、单 buffer、PCM 总量、pending source 和索引工作量；
- active 阶段 decoder 失败在插件根节点展示稳定错误状态；
- 完成真实 audio-only vertical slice 后，才从视频会话提取最小 PCM scheduler/clock；不预建通用媒体框架。

### 阶段 2 验收

- 固定样例的首 buffer、连续非静音输出、暂停/恢复、音量、前后/连续 seek、结束和重播通过；
- video、无主音轨、多主轨、不支持 codec、损坏、截断、无安全 seek 和资源超限准确拒绝；
- opening abort、active abort、切换和重复 dispose 停止 iterator、source、AudioContext、Input、定时器和 DOM；
- Mediabunny 只进入 `non-native-audio` 完整实现 chunk，不进入 manifest、probe、`browser-audio` 或 `/view` 首包；
- `pnpm test`、`pnpm lint`、`pnpm build` 与 bundle 门禁通过。

## 5. 阶段 3：共享 FFmpeg runtime 与 ffmpeg-audio

阶段 3 与视频 `ffmpeg-video` 共用一个从锁定 FFmpeg 官方源码构建的 decode-only Worker/WASM runtime，但新增独立 `ffmpeg-audio` 插件。

### 3.0 共同 runtime spike

在视频代表组合之外增加：

1. AIFF/AIFC + PCM 代表组合；
2. ASF audio-only + WMA 代表组合；
3. APE 代表版本/压缩等级；
4. audio-only、video、attached picture、多主轨、损坏、截断、不支持 codec 和资源超限对照。

记录：

- JS/Worker/WASM raw 与 gzip 体积，以及增加音频 demuxer/decoder 的增量；
- 初始化、首 buffer、持续实时解码、CPU 和峰值/稳定内存；
- 前后/快速 seek 延迟与文件读取量；
- 大于 2 GiB 偏移、尾部索引、超大 tag 和无索引行为；
- abort flag 与 Worker terminate 的取消完成时间；
- configure 输出、许可证、对应源码、专利与部署要求。

### 3.1 ffmpeg-audio 插件交付

只有代表组合通过体积、实时解码、内存、seek、取消、许可和部署门槛后才：

- 锁定共同 FFmpeg/Emscripten 版本和构建配置；
- 确定首批 AIFF/WMA/APE 或其他高价值组合；
- 实现独立 audio probe、manifest 和 registration；
- 通过共享 runtime audio adapter 输出 Float32 PCM；
- 接入音频 session 的 Web Audio scheduler；
- 添加固定样例、真实浏览器 smoke、prepare、哈希、许可证和 bundle 门禁。

FFmpeg 资产只保留一份版本化产物。`ffmpeg-audio` 与 `ffmpeg-video` 分别加载 adapter/client，但请求同一精确版本的 runtime URL；不能复制 WASM，也不能合并成一个对用户可见的万能插件。

### 3.2 按证据扩展

后续按真实需求评估 Musepack、AMR、AC-3/E-AC-3、Sun/NeXT、RealAudio 和更多 WAV/AIFF/WMA/APE 变体。每批只增加有固定样例、独立 probe 和完整播放证据的组合。

详细构建与运行时方案见[FFmpeg 音视频播放 fallback 接入方案](../videos/ffmpeg-playback-runtime-plan.md)。

## 6. 阶段 4：播放体验与领域增强

在不阻塞格式覆盖的前提下，按用户价值增加：

- bounded metadata、封面与安全图片解码；
- 多音轨选择、章节和 cue sheet；
- gapless、encoder delay/padding 和 album continuity；
- ReplayGain/R128 展示或可控应用；
- 歌词和时间同步文本；
- 多声道布局与输出设备语义；
- 按需、分层或预计算的波形/频谱，但不得让大文件必须全量解码才能开始播放；
- BWF、专业时码、ADM 等专业音频语义的独立评估。

这些能力可以把已声明组合从等级 3 提升到 4/5，但不作为阶段 1–3 扩大格式覆盖的前置条件。

## 7. 每次新增组合的统一门禁

- 支持矩阵新增精确组合，不只新增扩展名；
- manifest、probe、open 和 catalog 文案保持同一声明范围；
- 正常、损坏、截断、伪装、video 或 audio-only 对照、资源超限样例齐全；
- 首 buffer/真实媒体数据、连续播放、暂停、音量、seek、结束和重播通过；
- 不自动播放，不上传，不整体复制文件，不整段展开 PCM；
- 标签、封面、索引、PCM、Worker/WASM 和解码工作量有边界；
- opening abort、active abort、切换和重复 dispose 无残留声音与资源；
- 目标浏览器/OS/硬件证据和日期写回支持矩阵；
- 重型依赖只存在于对应完整插件/runtime chunk；
- 自动测试、真实浏览器 smoke、lint、build 和 bundle 门禁通过。

## 8. 相关文档

- [音频查看相关概念](concept.md)
- [音频格式与编码候选清单](format-inventory.md)
- [音频格式支持矩阵](support-matrix.md)
- [音频查看架构](architecture.md)
- [视频查看实施路线图](../videos/roadmap.md)
- [FFmpeg 音视频播放 fallback 接入方案](../videos/ffmpeg-playback-runtime-plan.md)
- [格式查看器插件协议](../viewer-plugin-protocol.md)
- [查看器插件渲染规范](../viewer-render-tips.md)
- [查看器加载、渲染与部署约定](../viewer-loading-and-deployment.md)
- [源码构建型第三方依赖规范](../viewer-source-built-dependencies.md)
