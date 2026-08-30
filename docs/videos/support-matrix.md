# 视频格式支持矩阵

- 状态：阶段 0、阶段 1 与阶段 2 已完成；阶段 3 FFmpeg 播放 fallback 已规划、尚未实现，专业视频顺延为阶段 4
- 事实来源：固定真实样例、目标环境中的真实播放、自动协议测试和锁定依赖
- 覆盖口径：以实际可播放的容器 × 视频 codec × 音频 codec 组合计数，不以扩展名数量或最高支持等级计数

网站 catalog 只概括已交付的容器入口，不替代组合级支持证据。只有本表中达到 `implemented` 或 `verified`、并能播放主要节目的具体组合，才可以进入视频支持文案。

阶段 0 的固定样例、probe 测量和原始媒体元素结果见[阶段 0 验收证据](roadmap-stage0-evidence.md)。阶段 1 与阶段 2 的组合状态来自各插件固定样例上的实际播放测试。

## 1. 支持等级

支持等级沿用全项目协议，并映射到视频领域：

| 等级 | 全项目含义 | 视频领域含义 |
|---:|---|---|
| 0 | 不支持当前文件 | 不是有效目标容器、没有视频轨道、组合不可播放或文件损坏 |
| 1 | 检查 | 只能展示容器、轨道、codec 或结构；不作为本视频路线图的交付目标 |
| 2 | 代表性预览 | 只能展示封面、关键帧或缩略图；不作为本视频路线图的格式支持 |
| 3 | 主要内容 | 主要节目与应有主音频可以连续播放，但存在已声明的高级语义或交互缺失 |
| 4 | 完整查看 | 在声明组合和环境内覆盖常见时间轴、方向、seek 及轨道语义 |
| 5 | 领域查看 | 在等级 4 基础上提供逐帧、timecode、专业轨道、色彩或其他领域导航 |

视频规划只交付等级 3 以上的播放插件。等级 1 和 2 保留是为了遵守全项目协议、描述其他通用插件的能力，不用于创建 metadata-only、封面或首帧视频插件。原生 controls、按钮数量、硬件解码或播放流畅本身不提高支持等级。

等级 3 是有效交付，不要求先升级到等级 4 才扩展下一个格式。以下能力仍是等级 3 的最低播放门槛：主要节目连续播放、文件应有的主音频可用、基础 seek、准确错误和完整资源释放。

## 2. 状态值

- `planned`：进入路线图，尚未实现；
- `spike`：正在验证容器、浏览器或第三方依赖；
- `implemented`：代码存在并可诚实描述当前播放能力，尚未完成声明范围内的自动与真实浏览器验收；缺少固定样例时保持此状态并补验，不等于不支持；
- `verified`：完成声明范围、目标环境和生命周期验收；
- `blocked`：存在具体且确实阻止实现或安全播放的技术、许可或部署问题；
- `deferred`：当前没有足够产品价值，不进入近期计划。

## 3. 记录粒度

每条实现记录至少包含：

```text
容器 + 必要的组织方式
  + 视频 codec / sample entry / 影响解码的 profile、level、bit depth
  + 音频 codec / 声道，或明确 video-only
  + 连续播放、主音频、基础 seek 和已知缺失
  + 浏览器 / 操作系统 / 版本 / 验证日期
```

同一组合可以在不同环境有不同实际等级。表中的“近期目标”是产品目标，不是 manifest 静态值；运行时仍由当前文件的 probe 和真实 `open()` 决定。

rotation、VFR、fragment、多轨、字幕、色彩和 HDR 只在影响声明范围或播放底线时拆行。它们不是每增加一个格式前都必须穷举的维度。

## 4. 当前规划矩阵

| 容器/组织 | 视频 | 音频 | 目标播放插件族 | 当前等级 | 状态 | 近期目标 | 阶段与说明 |
|---|---|---|---|---:|---|---:|---|
| MP4，头部或尾部 `moov` | AVC/H.264 Constrained Baseline L3.0，8-bit 4:2:0 | AAC-LC，48 kHz，双声道 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；连续播放、音频轨道与 seek 通过 |
| MP4，头部 `moov` | AVC/H.264 Constrained Baseline L3.0，8-bit 4:2:0 | 无 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；video-only 正常播放 |
| MP4，头部 `moov`，`hvc1` | HEVC Main，8-bit 4:2:0 | AAC-LC，48 kHz，双声道 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；`canPlayType()` 假阴性但真实播放通过 |
| MP4，头部 `moov`，`av01` | AV1 Main，8-bit 4:2:0 | AAC-LC，48 kHz，双声道 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；真实播放通过 |
| WebM | VP8 profile 0，8-bit 4:2:0 | Vorbis，48 kHz，单声道 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；真实播放通过 |
| WebM | VP9 profile 0，8-bit 4:2:0 | Opus，48 kHz，单声道 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；真实播放通过 |
| WebM | VP9 profile 0，8-bit 4:2:0 | 无 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；video-only 正常播放 |
| WebM | AV1 | Opus | browser video / non-native video | 0 | planned | 3–4 | 原生可播进入阶段 1，否则按需求进入阶段 2 |
| QuickTime/MOV，尾部 `moov` | AVC/H.264 Constrained Baseline L3.0 | AAC-LC，48 kHz，双声道 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；`canPlayType()` 假阴性但真实播放通过 |
| QuickTime/MOV，`sowt` | AVC/H.264 Baseline，8-bit 4:2:0 | PCM S16LE，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；Canvas、非静音音频、seek/end/replay 通过 |
| QuickTime/MOV | HEVC Main，8-bit 4:2:0 | 无 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；video-only、seek 与 resize 通过 |
| Matroska，有 Cues | AVC/H.264 Baseline，8-bit 4:2:0 | AAC，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；Canvas 连续播放、非静音音频与 seek 通过 |
| Matroska，有 Cues | HEVC Main，8-bit 4:2:0 | FLAC，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；Canvas 连续播放、非静音音频与 seek 通过 |
| Matroska，有 Cues | VP8 profile 0，8-bit 4:2:0 | Vorbis，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；独立轨道首时间戳恢复已验证 |
| Matroska，有 Cues | VP9 profile 0，8-bit 4:2:0 | Opus，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；Canvas 连续播放、非静音音频与 seek 通过 |
| Matroska，有 Cues | AV1 Main，8-bit 4:2:0 | MP3，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；Canvas 连续播放、非静音音频与 seek 通过 |
| Matroska，有 Cues | AVC/H.264 Baseline，8-bit 4:2:0 | 无 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；video-only 正常播放且不创建 AudioContext |
| MPEG-TS，188-byte，单 program | AVC/H.264 Baseline，8-bit 4:2:0 | AAC，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；Canvas 连续播放、非静音音频与 seek 通过 |
| MPEG-TS，188-byte，单 program | HEVC Main，8-bit 4:2:0 | MP3，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；Canvas 连续播放、非静音音频与 seek 通过 |
| M2TS，192-byte，单 program | AVC/H.264 Baseline，8-bit 4:2:0 | 无 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；video-only、seek 与 resize 通过 |
| AVI | MPEG-4 Part 2/Xvid 等首批代表组合 | MP3 等首批代表组合 | FFmpeg video fallback | 0 | planned | 3 | 阶段 3 spike；通过体积、seek、内存、取消、许可和真实播放后才确定声明子集 |
| MPEG-PS/VOB | MPEG-2 Video 等首批代表组合 | AC-3/MP2 等 | FFmpeg video fallback | 0 | planned | 3 | 阶段 3 spike；不包含 DVD 菜单、分支和加密语义 |
| ASF/WMV | Windows Media Video 首批代表组合 | WMA 首批代表组合 | FFmpeg video fallback | 0 | planned | 3 | 阶段 3 spike；具体 codec/profile 以固定样例和端到端证据为准 |
| MPEG-TS | MPEG-1/2 Video、AC-3、多 program/多主音频等未声明组合 | 对应音频 | FFmpeg video fallback | 0 | planned | 3 | 阶段 3 按具体组合评估；多 program/多主音频仍需独立轨道语义 |
| Ogg Video | Theora | Vorbis，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；OGV.js 软件解码，非静音 PCM 与 seek 通过 |
| Ogg Video | Theora | Opus，48 kHz，单声道 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；OGV.js 软件解码 |
| Ogg Video | Theora | 无 | non-native video | 3 | verified | 3 | Chromium 151 / macOS 15.6.1；video-only 不创建 AudioContext |
| 3GPP，尾部 `moov` | AVC/H.264 Constrained Baseline L1.3 | AAC-LC，48 kHz，单声道 | browser video | 3 | verified | 3–4 | Chromium 151 / macOS 15.6.1；真实播放通过 |
| 3GPP | H.263 等其他组合 | AMR 等 | FFmpeg video fallback | 0 | planned | 3–4 | 阶段 3 按真实需求和固定样例评估 |
| Flash Video | Sorenson/VP6/AVC 等 | AAC/MP3 等 | FFmpeg video fallback | 0 | deferred | 3 | 阶段 3 后续批次，取决于真实需求 |
| QuickTime/MOV | ProRes | PCM 等 | professional video | 0 | deferred | 3–5 | 阶段 4，先播放再增加专业能力；不能因阶段 3 decoder 存在而自动宣称支持 |
| MXF | MPEG-2、AVC-Intra、DNx、JPEG 2000 等 | PCM 等 | professional video | 0 | deferred | 3–5 | 阶段 4，按具体专业组合实现 |
| audio-only MP4/WebM/Ogg | 无 | 任意 | future audio | 0 | deferred | 0 | 视频 probe 必须返回 0；不属于视频路线图 |

`browser video` 对损坏的 A/V 轨道或 codec 不在声明范围内的文件返回 0，但不会因无法识别或非 A/V 的辅助轨道否决已有合法主 A/V。由于浏览器能力查询可能假阴性，probe 不调用 `canPlayType()`、不创建 DOM；真实环境解码失败由 `open()` 返回 `unsupported-environment`。只有已经实现端到端播放的后续插件才能接管，不增加只解析 metadata 的视频候选。

## 5. 固定样例要求

每个声明组合至少准备：

- 一个正常、短小、可再分发的含音频样例，或明确的 video-only 样例；
- 一个能够检查连续播放、基础 seek、结束和重播的样例；
- 一个损坏或截断样例；
- 一个不属于声明子集的同扩展名样例；
- audio-only 同容器样例（适用时），验证视频 probe 返回 0。

按容器和实现风险补充文件尾索引、fragment、VFR、rotation、异常时间戳、多轨、字幕、色彩或 HDR 样例；不要求每个新组合在交付前穷举所有高级语义。

样例 README 必须记录：来源或生成命令、再分发依据、容器、codec/sample entry、影响解码的 profile/level/bit depth、分辨率、时长、音频参数、目标环境、期望等级和已知限制。不能只依赖文件扩展名或生成工具的默认参数。

## 6. 真实浏览器证据要求

每个标记为 `verified` 的环境至少记录：

- 浏览器名称和完整版本、操作系统和版本、验证日期；
- 首帧可见且主要节目可以连续播放；
- 文件应有的主音频可用；
- 基础 seek、播放到结束和重播；
- 窄窗口、矮窗口和 resize 后控件仍可使用；
- 连续切换、opening abort、active abort 和重复 dispose 后无声音或加载残留；
- 声明支持的 rotation、VFR、多轨、字幕、色彩、HDR 或专业能力的实际结果；
- 已知但未声明支持的高级语义不会被文案误报。

Next.js 的 JavaScript 浏览器基线不代表对应媒体 codec 可用。视频矩阵必须记录实际媒体环境，而不是从框架支持范围推导。

### 阶段 1 目标环境记录（2026-08-29）

- 环境：Codex 应用内 Chromium 151，macOS 15.6.1（Apple Silicon）；
- 实际插件入口：Vite 直接导入 `browser-video` 的 `probe` 与完整实现，不使用模拟媒体事件；
- 十个声明样例均取得首帧、连续推进至少 0.35 秒，并完成基础 seek、播放到结束、重播与 260 × 180 窄容器 resize；含音频样例的 `captureStream()` 暴露 1 条音频轨道，且 Web Audio 时域峰值为 0.090–0.129，两个 video-only 样例暴露 0 条并保持 0 峰值；
- audio-only、损坏、截断和伪装扩展名样例均返回 probe 0，并由插件拒绝；
- opening abort 与 active abort 均停止媒体并清空插件 DOM；Object URL 撤销和重复 dispose 另由自动生命周期测试覆盖；
- Safari、Firefox、Windows、Android 和 iOS 尚未在本轮复验，不能从 Chromium 结果外推支持等级。

### 阶段 2 首批 Matroska 目标环境记录（2026-08-30）

- 环境：Codex 应用内 Chromium 151，macOS 15.6.1（Apple Silicon）；实际插件入口为 Vite 直接导入 `non-native-video` probe 与完整实现；
- 六个声明样例均取得首帧、连续 Canvas 帧变化、前后 seek、播放结束、重播和 260 × 180 窄容器 resize；五个含音频样例实际排入 Web Audio，解码样本峰值为 0.119–0.231，video-only 未创建音频源；
- audio-only、MPEG-4 Part 2、无 Cues、损坏、截断与伪装文件均由 probe 返回 0，并由完整插件准确拒绝；
- opening abort 与 active abort 均释放 Input、decoder、AudioContext、帧、回调和 DOM；重复 dispose 由自动协议测试覆盖；
- probe 预算为 768 KiB，完整 Blob 缓存上限 8 MiB，Canvas pool 为 2，音频预排约 1 秒，编码尺寸上限为 8192、像素上限为 33,554,432；
- 多视频/音频轨选择、字幕、章节、HDR 精确输出和专业色彩语义未声明；Safari、Firefox、Windows、Android 和 iOS 尚未复验。

### 阶段 2 MPEG-TS 目标环境记录（2026-08-30）

- 环境：Codex 应用内 Chromium 151，macOS 15.6.1（Apple Silicon）；实际插件入口为 Vite 直接导入 `non-native-video` probe 与完整实现；
- AVC/AAC、HEVC/MP3 与 AVC video-only 三个声明样例均取得首帧、连续 Canvas 帧变化、前后与快速连续 seek、播放结束、重播和 260 × 180 窄容器 resize；两条含音频路径的解码样本峰值分别为 0.244、0.132，video-only 未创建音频源；
- 188-byte TS 与 192-byte M2TS 已验证；probe 还识别 204-byte FEC packet layout，但尚无端到端固定样例，因此不单独写成 verified 组合；
- audio-only、MPEG-2 Video、AC-3、截断、损坏和 Matroska 伪装为 `.ts` 均由 probe 返回 0，并由完整插件拒绝；`open()` 不依赖 probe，按扩展名再次约束真实容器；
- probe 最多读取 512 KiB 头部；完整路径继续使用 8 MiB Blob cache、2 个 Canvas 帧槽和约 1 秒音频预排；MPEG-TS 的 duration/seek 使用 Mediabunny 5 MiB chunk 粗查与线性细化；
- 单 program、单主视频、最多一条主音频是当前声明边界；MPEG-2 Video、AC-3、多 program、多音轨、字幕、HDR 精确输出和专业色彩语义未声明；Safari、Firefox、Windows、Android 和 iOS 尚未复验。

### 阶段 2 QuickTime 与 Ogg 目标环境记录（2026-08-30）

- QuickTime 的 AVC/PCM S16LE 与 HEVC video-only 均通过连续 Canvas 帧、前后/连续 seek、end/replay 和 260 × 180 resize；PCM 解码峰值 0.125；AAC QuickTime 留给原生插件，非原生 probe 不误接管。
- Chromium 原生只能读取 Ogg Theora metadata、不能产生视频帧；`non-native-video` 因而按需加载 OGV.js 1.9.0 的 Ogg demux、Theora 与 Vorbis/Opus Worker/WASM。Theora/Vorbis 捕获 168 个非静音 PCM buffer、峰值 0.129；Theora video-only 不创建 AudioContext；Theora/Opus 使用独立固定样例复验。
- Ogg audio-only、损坏和伪装容器均 probe 0；普通路径与 Ogg 路径的实现 chunk 分离，OGV.js 资产、MIT 及 codec 许可证由构建门禁检查。

## 7. 自动测试与构建证据

- manifest 扩展名、协议版本和 workspace 权限；
- 有界 probe 对正常、损坏、截断、伪装、audio-only 和不支持子集返回正确等级；
- 同扩展名的 browser、non-native、FFmpeg fallback 和 professional 候选动态排序稳定；
- 完整 `open()` 的 success/error/abort 事件映射；
- opening abort、active abort、重复 dispose、媒体停止及 DOM 所有权；
- 原生路径的 Object URL 撤销；自定义路径的 Worker、WASM、AudioContext、帧缓存和 GPU 清理；
- mock DOM 测试只验证生命周期，不冒充真实 codec 播放验收；
- `pnpm test`、`pnpm lint`、`pnpm build` 通过；
- `/view` 初始 bundle 不包含视频实现、probe parser、demuxer 或 decoder；
- probe chunk 不静态带入完整播放器或重型依赖。

## 8. 组合记录模板

### 必须记录

- 扩展名、容器 magic、必要组织方式和声明 codec 子集；
- video-only 或视频内主音频；
- 首帧、连续播放、基础 seek、结束、重播和 A/V sync；
- 浏览器原生或自定义 demux/decode 路径；
- probe 读取范围，以及索引、缓冲、分辨率和并发边界；
- abort 和 dispose 释放的具体资源；
- 浏览器、操作系统、版本、日期、固定样例和实际等级。

### 按声明范围记录

- VFR、fragment、rotation、pixel aspect ratio 和显示尺寸；
- 多视频/音频轨、字幕、章节和附件；
- primaries、transfer、matrix、range、HDR 和 alpha；
- 逐帧、timecode 和专业轨道能力。
