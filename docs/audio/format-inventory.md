# 音频格式与编码候选清单

- 状态：阶段 0 inventory 已建立；实际交付仍只以支持矩阵的组合级状态为准
- 用途：确定固定样例、插件边界、真实浏览器基线和 FFmpeg spike 范围

实际支持状态只看 [support-matrix.md](support-matrix.md)。扩展名出现在网站图标规则、catalog 或本文中，不表示已有可用插件。

## 1. 纳入原则

候选排序依次考虑：

1. 用户遇到频率和本地预览价值；
2. 浏览器原生播放能力，以及能否保留原生 controls、硬件/系统 decoder 和较低内存成本；
3. Mediabunny 是否能分片 demux，目标环境 WebCodecs 是否能解码；
4. FFmpeg fallback 的增量体积、许可、专利、性能和维护成本；
5. 是否能获得可再生成、参数明确、可证明组合的固定样例；
6. 大文件、VBR 时长、seek、取消、缓冲和资源释放能否建立边界。

## 2. 容器与裸码流候选

| 容器/组织 | 常见扩展名 | 常见编码 | 首期判断 |
|---|---|---|---|
| MPEG Audio frame stream | `.mp3` | MPEG-1/2 Layer III，附 ID3/APE tag | 原生首批；VBR header、超大 ID3 与 seek 需固定证据 |
| RIFF/WAVE | `.wav` `.wave` | PCM、IEEE float、A-law、μ-law、ADPCM 等 | 常见 PCM 原生首批；其余按 Mediabunny/FFmpeg 证据扩展 |
| ISO BMFF / M4A / MP4 audio-only | `.m4a` `.mp4` | AAC、ALAC、MP3 等 | AAC-LC 原生首批候选；必须与视频 `.mp4` 按轨道内容分流 |
| Ogg audio-only | `.ogg` `.oga` `.opus` | Vorbis、Opus、FLAC | Vorbis/Opus 原生首批候选；Theora 文件继续属于视频 |
| WebM/Matroska audio-only | `.webm` `.mka` | Opus、Vorbis、FLAC、AAC 等 | WebM 原生或非原生；`.mka` 以 Mediabunny 路径为首批候选 |
| 原生 FLAC stream | `.flac` | FLAC | 原生首批候选，metadata block 与 picture 需有界处理 |
| ADTS | `.aac` `.adts` | AAC LC/HE 等 | 原生行为按环境验证；非原生路径可使用 Mediabunny + WebCodecs |
| AIFF/AIFC | `.aif` `.aiff` `.aifc` | PCM、浮点及历史压缩 | FFmpeg audio 首批高价值候选 |
| ASF audio-only | `.wma` `.asf` | WMA family | 与 ASF/WMV 视频共享 FFmpeg runtime spike，独立音频插件验收 |
| Monkey's Audio | `.ape` | APE lossless | FFmpeg audio 后续候选，重点测 seek、CPU 和内存 |
| Musepack | `.mpc` `.mpp` `.mp+` | Musepack SV7/SV8 | FFmpeg audio 后续候选 |
| AMR | `.amr` `.awb` | AMR-NB/WB | FFmpeg audio 后续候选，需许可与真实需求评审 |
| AC-3 elementary | `.ac3` `.eac3` `.ec3` | AC-3/E-AC-3 | FFmpeg audio 后续候选，需声道、专利和浏览器输出评审 |
| DTS elementary | `.dts` `.dtshd` | DTS family | 近期不承诺；许可、声道与体积成本较高 |
| Sun/NeXT audio | `.au` `.snd` | PCM、A-law、μ-law 等 | FFmpeg audio 低优先级历史格式候选 |
| RealAudio | `.ra` `.rm` | RealAudio family | 低优先级；按真实需求和可再分发样例评估 |

`.mp4`、`.webm`、`.ogg`、`.asf` 可能同时承载视频。音频插件只接收没有主视频节目、但存在一个可播放主音频节目的文件；attached picture 不视为主视频。

## 3. Codec 与 sample format 候选

| 家族 | 主要变量 | 建议路径 |
|---|---|---|
| MP3 | MPEG version、layer、sample rate、channel mode、CBR/VBR/free-format | 常见组合原生优先，异常或历史变体按证据进入 FFmpeg |
| AAC | LC/HE/HEv2、Audio Object Type、ADTS/MP4、SBR/PS、声道 | AAC-LC 原生首批；其他 profile 逐项验证 |
| Opus | Ogg/WebM/Matroska、pre-skip、channel mapping | 原生优先，非原生按 WebCodecs 环境证据 |
| Vorbis | Ogg/WebM/Matroska、channel layout | 原生优先，软件 fallback 不因已有 OGV.js 自动宣称 audio-only 支持 |
| FLAC | native/Ogg/Matroska、位深、声道、STREAMINFO | native FLAC 原生首批；容器变体逐项验证 |
| ALAC | MP4/M4A、位深、声道 | 原生行为实测；未覆盖组合进入 FFmpeg 候选 |
| PCM integer | 8/16/24/32-bit、signedness、endianness、packed layout | WAVE 常见 little-endian 原生首批；其他由 Mediabunny/FFmpeg |
| PCM float | 32/64-bit、endianness | 按 WAVE/AIFF 组合验证 |
| A-law / μ-law | 容器、采样率、声道 | Mediabunny/FFmpeg 候选 |
| ADPCM | IMA/MS/其他 dialect、block alignment | FFmpeg 候选，不以“WAV”统称支持 |
| WMA | v1/v2/Pro/Lossless、声道 | FFmpeg audio 首批 spike |
| APE / Musepack | 版本、seek table、压缩等级 | FFmpeg audio 后续 |
| AC-3/E-AC-3/DTS | profile、声道布局、对象音频扩展 | 后续 FFmpeg 候选，必须单独完成许可和输出语义评审 |

## 4. 标签与辅助内容候选

| 类型 | 常见位置 | 首期范围 |
|---|---|---|
| ID3v1/v2 | MP3、ADTS 等 | 有界识别；不遍历或解码超大 APIC |
| Vorbis Comment | Ogg/FLAC | 有界读取可靠文本字段 |
| FLAC picture block | FLAC metadata | 首期可忽略展示，但必须安全跳过 |
| MP4 metadata / cover | M4A/MP4 | 首期只读可靠基础字段；封面后续 |
| RIFF INFO/BEXT | WAVE | INFO 可后续展示；BWF 专业语义不作为首期门槛 |
| APE tag | APE/MP3/Musepack | 有界识别，尾部读取需计入 probe 预算 |
| cue sheet / chapters | FLAC、Matroska、外部 `.cue` | 后续轨道/章节体验 |
| lyrics | ID3、Vorbis Comment、外部文件 | 后续；不自动读取同目录关联文件 |
| ReplayGain/R128 | 多种标签 | 后续；未实现时不改变原始音量 |

## 5. 首批固定语料建议

阶段 0 至少准备：

- MP3：CBR、Xing/VBRI VBR、ID3v2 + APIC、尾部 ID3v1；
- WAVE：PCM S16LE mono/stereo、PCM S24LE、float32，以及一个不支持的 ADPCM 对照；
- M4A/MP4：AAC-LC audio-only、ALAC 对照、同扩展名真实视频对照；
- Ogg：Vorbis、Opus、Theora/Vorbis 视频对照；
- WebM/Matroska：Opus audio-only、VP9/Opus 视频对照、`.mka` 代表样例；
- FLAC：16-bit stereo、24-bit、含 picture block；
- ADTS AAC：AAC-LC 与其他 profile 对照；
- AIFF PCM、WMA、APE 作为 FFmpeg spike 样例；
- 每个容器族的损坏、截断、伪装扩展名、超大标签或资源超限反例。

固定音频可以使用合成音、短静音开头和已知非静音区段生成。听音 smoke 使用已知非静音区段验证输出，打开逻辑不得以振幅非零作为有效性条件。

## 6. 明确排除

- 视频文件中的音频轨道；
- 网络流、播放列表和远程 URL；
- DRM 和加密媒体；
- MIDI、DAW 工程、tracker module、soundfont 和游戏音频 bank；
- 编辑、转码、波形编辑、标签写入和导出；
- “FFmpeg 能识别”但项目没有独立 probe、播放器接入和端到端证据的格式。

## 7. 相关文档

- [音频查看相关概念](concept.md)
- [音频格式支持矩阵](support-matrix.md)
- [音频查看架构](architecture.md)
- [音频查看实施路线图](roadmap.md)
- [FFmpeg 音视频播放 fallback 接入方案](../videos/ffmpeg-playback-runtime-plan.md)
