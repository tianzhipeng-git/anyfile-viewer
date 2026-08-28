# 视频格式支持矩阵

- 状态：阶段 0 规划基线，尚无视频插件通过验收
- 事实来源：固定真实样例、目标环境中的真实播放、自动协议测试和锁定依赖

网站 catalog 当前列出 MP4、WebM 只是产品候选，不构成支持证据。只有本表中达到 `implemented` 或 `verified` 的具体组合可以进入相应支持文案。

## 1. 支持等级

支持等级沿用全项目协议，并映射到视频领域：

| 等级 | 全项目含义 | 视频领域含义 |
|---:|---|---|
| 0 | 不支持当前文件 | 不是有效目标容器、没有视频轨道、组合不可用或文件损坏 |
| 1 | 检查 | 可靠展示容器、轨道、codec、时长或结构，但不能播放主要内容 |
| 2 | 代表性预览 | 展示封面、关键帧、缩略图或 contact sheet，不能连续播放主要节目 |
| 3 | 主要内容 | 主要节目可连续播放，但缺少有意义的能力，如部分音轨、字幕、可靠 seek 或正确 HDR |
| 4 | 完整查看 | 在声明组合和环境内完整播放主要画面与声音，并覆盖常见时间轴、方向和 seek 语义 |
| 5 | 领域查看 | 在等级 4 基础上提供理解专业视频所需的轨道、逐帧、timecode、色彩或其他领域导航 |

原生 controls、按钮数量、硬件解码或播放流畅本身不提高支持等级。只有画面而丢失文件应有的主音频时，不能返回等级 4。

## 2. 状态值

- `planned`：进入路线图，尚未实现；
- `spike`：正在验证容器、浏览器或第三方依赖；
- `implemented`：代码存在，尚未完成全部自动与真实浏览器验收；
- `verified`：完成本矩阵要求的声明范围、环境和生命周期验收；
- `blocked`：存在具体技术、许可、样例或部署阻塞；
- `deferred`：当前没有足够产品价值，不进入近期计划。

## 3. 记录粒度

每条实现记录至少包含：

```text
容器 + 组织方式
  + 视频 codec / sample entry / profile / level / bit depth
  + 音频 codec / 声道，或明确 video-only
  + 轨道、seek、rotation、色彩/HDR 声明
  + 浏览器 / 操作系统 / 版本 / 验证日期
```

同一组合可以在不同环境有不同实际等级。表中的“近期目标”是产品目标，不是 manifest 静态值；运行时仍由当前文件的 probe 和真实 `open()` 决定。

## 4. 当前规划矩阵

以下条目尚无视频插件实现，等级均为 0。精确 profile、level 和音频参数将在阶段 0 样例确定后拆为可验证行。

| 容器/组织 | 视频 | 音频 | 目标插件族 | 当前等级 | 状态 | 近期目标 | 说明 |
|---|---|---|---|---:|---|---:|---|
| MP4，普通索引 | AVC/H.264 | AAC | browser video | 0 | planned | 4 | 阶段 1 第一候选；必须绑定实际 sample entry/profile |
| MP4，普通索引 | AVC/H.264 | 无 | browser video | 0 | planned | 4 | video-only 是有效视频，不要求虚构音轨 |
| MP4，`moov` 在文件尾 | AVC/H.264 | AAC | browser video | 0 | planned | 4 | 需要尾部分片 probe 和真实 seek 验证 |
| Fragmented MP4 | AVC/H.264 | AAC | browser video | 0 | planned | 3–4 | fragment、duration 和 seek 独立验证 |
| MP4 | HEVC | AAC | browser video | 0 | planned | 3–4 | 浏览器、系统与硬件差异按环境记录 |
| MP4 | AV1 | AAC/Opus | browser video | 0 | planned | 3–4 | sample entry、音频组合和环境独立验证 |
| WebM | VP8 | Vorbis/Opus | browser video | 0 | planned | 4 | 阶段 1 候选，按实际样例拆行 |
| WebM | VP9 | Opus | browser video | 0 | planned | 4 | 阶段 1 候选，profile/bit depth 独立记录 |
| WebM | VP8/VP9 | 无 | browser video | 0 | planned | 4 | video-only 基线 |
| WebM | AV1 | Opus | browser video | 0 | planned | 3–4 | 阶段 2 按环境验证 |
| QuickTime/MOV | AVC/HEVC | AAC/PCM | browser video | 0 | planned | 3–4 | 不因与 MP4 同族自动承诺 |
| QuickTime/MOV | ProRes | PCM 等 | professional video | 0 | deferred | 5 | 需要专业 decoder、色彩、音频和 timecode 范围 |
| Matroska | AVC/HEVC/VP9/AV1 等 | 多种 | browser/legacy video | 0 | deferred | 3–4 | Matroska 不等同于 WebM，按组合评估 |
| Ogg Video | Theora | Vorbis/Opus | browser/legacy video | 0 | deferred | 4 | 用户价值和目标环境待验证 |
| AVI | 历史与常见 codec | 多种 | legacy video | 0 | deferred | 3–4 | 不能只因 RIFF 容器可解析就声明播放 |
| MPEG-PS/TS | MPEG-1/2、AVC、HEVC 等 | 多种 | legacy video | 0 | deferred | 3–4 | 时间戳、索引、损坏恢复和变体复杂 |
| MXF | MPEG-2、AVC-Intra、DNx、JPEG 2000 等 | PCM 等 | professional video | 0 | deferred | 5 | 专业轨道、timecode 和 metadata |
| audio-only MP4/WebM/Ogg | 无 | 任意 | future audio | 0 | deferred | 0 | 视频 probe 必须返回 0；不属于视频路线图 |

## 5. 阶段 0 样例矩阵

每个首批声明组合至少准备：

- 一个正常、短小、可再分发的基线样例；
- 一个 video-only 样例；
- 一个能够检查音画同步的含音频样例；
- 一个损坏文件和一个截断文件；
- 一个伪装扩展名文件；
- audio-only 同容器文件，用于验证视频 probe 返回 0。

跨首批组合还需要覆盖：

- `moov` 在头部和尾部；
- 可 seek 到开头、中间和接近结尾；
- 固定帧率和可变帧率；
- 横向与带 rotation 的竖向视频；
- 非方形像素或显示比例 metadata；
- 无音频、单音轨和多音轨容器；
- 很短时长、零/未知时长和异常时间戳；
- 尺寸、轨道数、box/element 长度与嵌套的边界样例。

样例 README 必须记录：来源或生成命令、再分发依据、容器、sample entry、codec/profile/level、bit depth、分辨率、帧率模式、时长、音频参数和期望等级。不能只依赖文件扩展名或生成工具的默认参数。

## 6. 真实浏览器证据要求

每个标记为 `verified` 的环境至少记录：

- 浏览器名称和完整版本；
- 操作系统和版本；
- 验证日期；
- 是否已知使用硬件或软件解码；无法可靠确定时写未知；
- 首帧可见；
- 播放到结束并能重播；
- 开头、中间和接近结尾 seek；
- 含音频样例的连续播放与同步结果；
- rotation、显示比例和声明的色彩/HDR 行为；
- 窄窗口、矮窗口和 resize；
- 连续切换、opening abort、active abort 和重复 dispose 后无声音或加载残留。

Next.js 的 JavaScript 浏览器基线不代表对应媒体 codec 可用。视频矩阵必须记录实际媒体环境，而不是从框架支持范围推导。

## 7. 自动测试与构建证据

- manifest 扩展名、协议版本和 workspace 权限；
- 有界 probe 对正常、损坏、截断、伪装、audio-only 和资源边界返回正确等级；
- 同扩展名候选的动态排序稳定；
- 完整 open 的 success/error/abort 事件映射；
- opening abort、active abort、重复 dispose、Object URL 撤销、媒体停止和 DOM 所有权；
- mock DOM 测试只验证生命周期，不冒充真实 codec 播放验收；
- 真实浏览器 smoke 使用真实文件和完整插件入口；
- `npm test`、`npm run lint`、`npm run build` 通过；
- `/view` 初始 bundle 不包含视频实现、probe parser、demuxer 或 decoder 标记；
- probe chunk 不静态带入完整播放器或重型依赖。

## 8. 每个组合必须记录的维度

### 格式识别

- 扩展名、容器 magic 和必要结构；
- sample entry、codec string、profile、level、bit depth 和 chroma；
- 普通索引、文件尾索引、fragment 或其他组织方式；
- audio-only、空轨道、伪装、损坏和截断行为。

### 内容能力

- video-only 或视频内主音频；
- duration、VFR、seek、end/replay 和 A/V sync；
- rotation、pixel aspect ratio、显示尺寸；
- 多视频/音频轨、字幕、章节和附件；
- primaries、transfer、matrix、range、HDR 和 alpha。

### 资源行为

- 原生浏览器或自定义 parser/demux/decode；
- probe 读取范围和最坏解析工作量；
- 文件、索引、轨道、sample、分辨率、缓冲与并发边界；
- abort 和 dispose 释放的具体资源。

### 环境与证据

- 浏览器、操作系统、版本和日期；
- 固定真实样例与参数证明；
- 自动测试名称和真实播放 smoke；
- 已知缺失、降级理由和近期目标。
