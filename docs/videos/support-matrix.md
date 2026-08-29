# 视频格式支持矩阵

- 状态：阶段 0 规划基线，尚无视频插件通过验收
- 事实来源：固定真实样例、目标环境中的真实播放、自动协议测试和锁定依赖
- 覆盖口径：以实际可播放的容器 × 视频 codec × 音频 codec 组合计数，不以扩展名数量或最高支持等级计数

网站 catalog 当前列出的格式只是产品候选，不构成支持证据。只有本表中达到 `implemented` 或 `verified`、并能播放主要节目的具体组合，才可以进入视频支持文案。

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
- `implemented`：代码存在，尚未完成声明范围内的自动与真实浏览器验收；
- `verified`：完成声明范围、目标环境和生命周期验收；
- `blocked`：存在具体技术、许可、样例或部署阻塞；
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

以下条目尚无视频插件实现，等级均为 0。精确 codec 参数将在固定样例确认后拆为可验证行。

| 容器/组织 | 视频 | 音频 | 目标播放插件族 | 当前等级 | 状态 | 近期目标 | 阶段与说明 |
|---|---|---|---|---:|---|---:|---|
| MP4，常见组织 | AVC/H.264 | AAC | browser video | 0 | planned | 3–4 | 阶段 1 第一候选 |
| MP4，常见组织 | AVC/H.264 | 无 | browser video | 0 | planned | 3–4 | 阶段 1；video-only 是有效视频 |
| MP4，包括文件尾 `moov` 或 fragment | AVC/H.264 | AAC | browser video | 0 | planned | 3–4 | 阶段 1 按真实原生播放结果纳入，不单设深挖阶段 |
| MP4 | HEVC | AAC | browser video / non-native video | 0 | planned | 3–4 | 原生可播进入阶段 1，否则按需求进入阶段 2 |
| MP4 | AV1 | AAC/Opus | browser video / non-native video | 0 | planned | 3–4 | 原生可播进入阶段 1，否则按需求进入阶段 2 |
| WebM | VP8 | Vorbis/Opus | browser video | 0 | planned | 3–4 | 阶段 1 候选 |
| WebM | VP9 | Opus | browser video | 0 | planned | 3–4 | 阶段 1 候选 |
| WebM | VP8/VP9 | 无 | browser video | 0 | planned | 3–4 | 阶段 1 video-only 基线 |
| WebM | AV1 | Opus | browser video / non-native video | 0 | planned | 3–4 | 原生可播进入阶段 1，否则按需求进入阶段 2 |
| QuickTime/MOV | AVC/HEVC | AAC/PCM | browser video / non-native video | 0 | planned | 3–4 | 原生明确组合阶段 1，其余阶段 2 |
| Matroska | AVC/HEVC/VP9/AV1 等 | 常见音频子集 | non-native video | 0 | planned | 3 | 阶段 2 重点，按具体组合实现 |
| AVI | 选定高频 codec | 选定高频音频 | non-native video | 0 | planned | 3 | 阶段 2 候选，不承诺整个 AVI 生态 |
| MPEG-PS/TS | MPEG-1/2、AVC、HEVC 等选定组合 | 选定高频音频 | non-native video | 0 | planned | 3 | 阶段 2 候选，按时间轴可控子集实现 |
| Ogg Video | Theora | Vorbis/Opus | browser video / non-native video | 0 | planned | 3–4 | 原生可播阶段 1，否则按需求阶段 2 |
| 3GPP | AVC/H.263 等 | AAC/AMR 等 | browser video / non-native video | 0 | planned | 3–4 | 原生可播阶段 1，否则按需求阶段 2 |
| Flash Video | Sorenson/VP6/AVC 等 | AAC/MP3 等 | non-native video | 0 | deferred | 3 | 阶段 2 低优先级，取决于真实需求 |
| QuickTime/MOV | ProRes | PCM 等 | professional video | 0 | deferred | 3–5 | 阶段 3，先播放再增加专业能力 |
| MXF | MPEG-2、AVC-Intra、DNx、JPEG 2000 等 | PCM 等 | professional video | 0 | deferred | 3–5 | 阶段 3，按具体专业组合实现 |
| audio-only MP4/WebM/Ogg | 无 | 任意 | future audio | 0 | deferred | 0 | 视频 probe 必须返回 0；不属于视频路线图 |

`browser video` 在当前环境无法播放某个组合时返回 0；只有已经实现该组合端到端播放的 `non-native video` 或 `professional video` 才能接管。不会增加只解析 metadata 的视频候选。

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

## 7. 自动测试与构建证据

- manifest 扩展名、协议版本和 workspace 权限；
- 有界 probe 对正常、损坏、截断、伪装、audio-only 和不支持子集返回正确等级；
- 同扩展名的 browser、non-native 和 professional 候选动态排序稳定；
- 完整 `open()` 的 success/error/abort 事件映射；
- opening abort、active abort、重复 dispose、媒体停止及 DOM 所有权；
- 原生路径的 Object URL 撤销；自定义路径的 Worker、WASM、AudioContext、帧缓存和 GPU 清理；
- mock DOM 测试只验证生命周期，不冒充真实 codec 播放验收；
- `npm test`、`npm run lint`、`npm run build` 通过；
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
