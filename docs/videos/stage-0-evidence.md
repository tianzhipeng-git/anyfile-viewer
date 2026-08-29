# 视频路线图阶段 0 验收证据

- 验收日期：2026-08-29
- 范围：只建立固定语料、原生媒体行为、probe 预算和资源门禁；未实现或注册视频插件
- 结论：阶段 0 完成，阶段 1 可以开始

## 1. 持续验收环境

视频能力必须记录实际媒体环境，不能从 Next.js 浏览器基线推导。持续验收采用以下策略：

| 层级 | 环境 | 频率 | 记录要求 |
|---|---|---|---|
| 必跑 | Chrome stable / macOS、Edge stable / Windows、Firefox stable / Windows、Safari stable / macOS | 每个新增声明组合和 codec 变更 | 浏览器完整版本、OS 版本与 build、日期、硬件架构；首帧、连续播放、主音频、seek、结束/重播、resize、abort/dispose |
| 回归 | 上述浏览器的前一个 stable major | 发布前或已知媒体回归时 | 与必跑相同 |
| 能力候选 | HEVC、AV1、MOV、Ogg Video、3GPP | 每个目标环境分别记录 | 不跨环境外推；只把实际可播放的组合带入阶段 1 |

自动 DOM 测试只承担协议和生命周期验证。codec 播放结论必须来自真实浏览器；未执行的环境保持 `not tested`，不能记为支持或不支持。

本次基线在 macOS 15.6.1（24G90，Apple Silicon）上的 Codex in-app Chromium 151.0.0.0 执行。机器同时安装 Chrome 151.0.7922.174 和 Safari 18.6，但本次没有通过可控浏览器会话执行它们，因此不记录播放结论。

## 2. 固定样例

[`browser-video/examples/README.md`](../../viewer/plugins/browser-video/examples/README.md) 记录 13 个正常/对照样例的生成来源、再分发依据和精确参数。MP4、WebM、QuickTime、Ogg 和 3GPP 每个容器族均有损坏、截断和伪装扩展名样例；MP4 与 WebM 另有 video-only 和 audio-only 对照。

所有媒体由合成画面和合成音频生成，不依赖网络下载。阶段 1 每次把新增组合标记为 `verified` 前，必须在该目录增加参数明确的固定样例；实现可以先以 `implemented` / 待验证状态进入声明范围，缺少固定样例本身不等于不支持。

## 3. Probe 测量与预算

运行 `node scripts/measure-video-probes.mjs` 对已提交正常样例测量。当前观测值：

| 项目 | 最大观测值 |
|---|---:|
| 正常样例文件 | 188,916 bytes（Ogg） |
| ISO BMFF `moov` | 6,046 bytes（HEVC MP4） |
| 文件尾 `moov` 起点 | 92,693 bytes（tail-moov MP4） |
| WebM `Tracks` 元素起点 | 73 bytes |
| ISO BMFF 顶层 box 数 | 4 |
| 样例轨道数 | 2 |

阶段 1 probe 的初始硬预算据此确定为：

- 最多读取头部 256 KiB 与尾部 256 KiB，总读取量不超过 512 KiB；头尾重叠时不得重复读取；
- ISO BMFF 跳过 `mdat` 内容，只解析有界 box header 和取得轨道/codec 所需的 metadata；不能按声明的媒体 payload 大小分配内存；
- WebM/EBML 跳过 Cluster 媒体 payload，只解析 EBML header、Segment 元信息和 Tracks；
- 最大嵌套深度 12、最大轨道数 32、最多访问 4,096 个 box/element；偏移、长度和加法必须为安全整数且落在文件范围内；
- 必需 metadata 超出分片、深度、轨道或访问数预算时保守返回 0，不为 probe 扩大到完整文件解析；
- 这些值分别是当前最大 metadata 体积/位置的 40 倍以上、轨道数的 16 倍和顶层结构数的 1,024 倍，同时把单候选读取固定在 512 KiB。它们是阶段 1 可复测的初始边界，不是任意继承图片的 1 MiB 阈值。

新增真实样例若在合法常见结构下超过预算，应先提交测量证据再调整；不得仅提高上限绕过 probe 失败。

## 4. 真实 Chromium smoke

[`browser-smoke.html`](../../viewer/plugins/browser-video/browser-smoke.html) 通过本地 HTTP 打开固定文件，为每个文件创建临时 Object URL，并验证 `loadedmetadata`、非零视频尺寸、第一帧、播放时间推进、基础 seek、媒体错误和清理顺序（pause → remove `src` → `load()` → revoke URL）。

2026-08-29 的结果：

| 结果 | 组合 |
|---|---|
| 连续播放且基础 seek 通过 | MP4 AVC/AAC（头部及尾部 `moov`）、MP4 AVC video-only、WebM VP8/Vorbis、WebM VP9/Opus、WebM VP9 video-only、MP4 HEVC/AAC、MP4 AV1/AAC、MOV AVC/AAC、3GPP AVC/AAC |
| 只读到 metadata，没有视频画面 | MP4 AAC audio-only、WebM Opus audio-only、Ogg Theora/Vorbis |
| 不能打开 | 五个容器族的损坏与截断样例 |
| 浏览器嗅探后仍可播放 | 五个伪装扩展名样例；说明 probe 必须自行拒绝容器不匹配 |

该结果只证明上述 Chromium 环境的原生媒体行为，不是插件支持证据。音频轨道存在性由固定样例参数确认；自动 muted smoke 不冒充主音频的人工听音验收。

## 5. 阶段 1 门禁

- 原生路径只把原始 `File` 交给 Object URL，不复制完整媒体，不设置无依据的统一文件大小/时长/像素限制；
- `open()` 不能只等待 `loadedmetadata`，至少要确认当前文件产生第一帧条件；audio-only 必须在 probe 阶段返回 0；
- opening abort、active abort 和 dispose 共用一套清理：停止回调、pause、移除监听、清除 `src`/`source`、调用 `load()`、撤销 Object URL、移除根节点；
- manifest、probe 和完整实现必须为独立入口；`/view` 首包不得包含视频实现或 probe parser，probe chunk 不得静态包含完整播放器；
- 真实浏览器 smoke、协议测试和 bundle 检查必须同时通过，catalog 文案不能先于支持矩阵宣称已实现。
