# 音频格式支持矩阵

- 状态：阶段 0 已完成；阶段 1、2 组合已实现并在当前 Chromium 环境验证，完整目标浏览器矩阵仍在补证
- 覆盖口径：以实际可播放的容器/裸码流 × codec/profile/sample format × 声道组合计数，不以扩展名数量计数

网站 catalog 和文件图标只能概括已经交付的格式入口，不能替代本表的组合级证据。只有达到 `implemented` 或 `verified`、并能播放主要音频节目的具体组合，才可以进入支持文案。

## 1. 状态定义

| 状态 | 含义 |
|---|---|
| `candidate` | 候选组合，尚未完成实现决策 |
| `planned` | 已进入明确阶段，但尚未实现 |
| `implemented` | 已实现播放路径，证据或环境覆盖尚未完成 |
| `verified` | 固定样例、真实浏览器播放和生命周期验收均通过 |
| `blocked` | 已验证存在明确依赖、许可、资源或环境阻塞 |
| `deferred` | 当前价值不足或依赖后续能力，暂不安排 |

支持等级沿用全项目协议。音频路线图只把等级 3 以上视为格式播放交付；metadata、封面、波形或短试听片段不算支持。

## 2. 组合级支持表

| 容器/组织 | codec / sample format | 声道与关键配置 | 目标插件族 | 当前等级 | 状态 | 目标等级 | 阶段与说明 |
|---|---|---|---|---:|---|---:|---|
| MP3 frame stream | MP3 | MPEG-1 Layer III，48 kHz，stereo，CBR | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 真实播放、暂停、seek、结束和重播通过；其他环境待补证 |
| MP3 frame stream | MP3 | Xing VBR，48 kHz，stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 时长、前后 seek 和结束位置通过；VBRI 与其他环境待补证 |
| MP3 frame stream | 其他 Layer/version/free-format 变体 | 待定 | browser/non-native/FFmpeg audio | 0 | candidate | 3 | 按真实频率与解码证据逐项增加 |
| RIFF/WAVE | PCM S16LE | 48 kHz，stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 原生播放通过 |
| RIFF/WAVE | PCM S24LE / PCM F32LE | 48 kHz，stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 原生播放通过，其他环境待补证 |
| RIFF/WAVE | A-law / μ-law | mono/stereo | non-native/FFmpeg audio | 0 | candidate | 3 | 以 Mediabunny PCM 路径和真实浏览器输出为准 |
| RIFF/WAVE | IMA/MS ADPCM 等 | 具体 block layout | FFmpeg audio | 0 | candidate | 3 | 不因扩展名为 WAV 自动支持 |
| M4A/MP4 audio-only | AAC-LC | 48 kHz，stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 真实播放及 MP4 视频互斥通过 |
| M4A/MP4 audio-only | HE-AAC/HE-AACv2 | profile、SBR/PS 待定 | browser/non-native/FFmpeg audio | 0 | candidate | 3 | 环境差异和 duration/gapless 需独立证据 |
| M4A/MP4 audio-only | ALAC | 16/24-bit，mono/stereo | browser/FFmpeg audio | 0 | candidate | 3 | 先测原生路径，再决定 fallback |
| Ogg audio-only | Vorbis | 48 kHz，stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 播放及 Theora 互斥通过 |
| Ogg audio-only | Opus | 48 kHz，stereo，pre-skip | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 时长、seek、结束和重播通过 |
| Ogg audio-only | FLAC | 常见位深/声道 | browser/non-native audio | 0 | candidate | 3 | 按真实环境能力决定路径 |
| WebM audio-only | Opus/Vorbis | 48 kHz，stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 播放及 WebM 视频互斥通过 |
| Matroska audio-only | Opus/Vorbis/FLAC/AAC | 48 kHz stereo，单个主音轨，存在可用 seek index | non-native audio | 3 | implemented | 3 | 阶段 2；四个 `.mka` 固定样例在 Chromium 连续输出、seek、结束和重播通过 |
| native FLAC | FLAC | 16/24-bit，48 kHz stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 播放通过，picture block 与 metadata 有界跳过 |
| ADTS | AAC-LC | 48 kHz，stereo | browser audio | 3 | implemented | 3 | 阶段 1；Chromium 原生播放通过，其他环境待补证 |
| AIFF/AIFC | PCM S16BE/S24BE/F32BE 等 | mono/stereo | FFmpeg audio | 0 | planned | 3 | FFmpeg 首批 audio spike |
| ASF audio-only | WMA v1/v2 首批代表组合 | mono/stereo | FFmpeg audio | 0 | planned | 3 | 与 ASF/WMV 视频共享 runtime，独立音频证据 |
| APE | Monkey's Audio | 代表版本/压缩等级 | FFmpeg audio | 0 | candidate | 3 | 测 CPU、内存、seek 和取消后再决定 |
| Musepack | SV7/SV8 | mono/stereo | FFmpeg audio | 0 | deferred | 3 | 后续按真实需求 |
| AMR | AMR-NB/WB | mono | FFmpeg audio | 0 | deferred | 3 | 许可和真实需求评审后决定 |
| AC-3/E-AC-3 elementary | AC-3/E-AC-3 | stereo/多声道 | FFmpeg audio | 0 | deferred | 3 | 声道、专利和输出语义必须独立评审 |
| DTS elementary | DTS family | 多声道 | FFmpeg audio | 0 | deferred | 3 | 近期不承诺 |
| 含主视频节目的 MP4/WebM/Ogg/ASF | 任意音频 | 任意 | video viewers | 0 | implemented | 0 | MP4/WebM/Ogg 音频 probe 互斥已实现；attached picture 不计主视频 |

本表的 `browser audio` 只表示首选路径，不表示当前浏览器已被证明支持。阶段 0 完成后，应把参数、浏览器/OS、样例和证据写回每一行。

## 3. 固定证据要求

每个正式声明组合至少记录：

- 文件 SHA-256、生成命令或来源、再分发依据；
- 容器/裸码流、codec/profile/sample format、sample rate、声道布局；
- CBR/VBR、时长/index/header、encoder delay 或影响 seek 的关键配置；
- 标签和封面是否存在，以及它们的字节与解码资源边界；
- probe 读取头尾字节数、访问项、扫描帧数和最坏工作量；
- 首个 decoded buffer、连续播放、暂停/恢复、音量、前后/快速 seek、结束和重播；
- opening abort、active abort、切换和重复 dispose；
- 浏览器完整版本、OS/build、硬件架构和验证日期；
- 已知缺失，例如 gapless、ReplayGain、多音轨、章节、歌词、封面或 bit-perfect。

## 4. 反例要求

每个容器族按适用性覆盖：

- 空文件、损坏、截断、伪装扩展名；
- 同扩展名但包含主视频节目的文件；
- 不支持 codec/profile/sample format；
- 大型 ID3/APIC、comment、picture block 的有界跳读，以及异常长度字段、过多 block/track；
- 无法安全建立时长或基础 seek 的 VBR/无索引文件；
- 异常时间戳、零时长、无音频帧或只含辅助图片；
- 多个无法确定默认项的主音轨；
- 超出 Worker/WASM、PCM 队列或解码资源上限的文件。

probe 返回 0 不能代替完整插件校验。`open()` 必须独立复验真实格式、轨道、codec、时长、环境能力和资源边界。

## 5. 播放验收口径

- `open()` 不自动播放，也不等待用户手势；
- 原生路径至少取得当前文件真实可播放数据，而不只取得标签或 duration；
- 自定义路径至少取得一个时间戳和长度有效的 decoded PCM buffer；首 buffer 可以是静音；
- 固定非静音样例在真实 smoke 中证明输出链确实调度且产生非静音信号；
- 暂停后停止推进和发声，seek 后旧 generation 不再输出；
- PCM lookahead、iterator、AudioBufferSourceNode、AudioContext、Worker 和文件输入均有界且可释放；
- 只展示 metadata、封面、波形或代表性片段不得标为等级 3。

## 6. 相关文档

- [音频格式与编码候选清单](format-inventory.md)
- [音频查看架构](architecture.md)
- [音频查看实施路线图](roadmap.md)
- [视频格式支持矩阵](../videos/support-matrix.md)
- [FFmpeg 音视频播放 fallback 接入方案](../videos/ffmpeg-playback-runtime-plan.md)
