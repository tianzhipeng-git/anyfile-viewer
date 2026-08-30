# 阶段 3：FFmpeg 音视频播放 fallback 接入方案

- 状态：规划中，先执行运行时 spike，再实现插件
- 目标：构建一套受控、共享的 decode-only FFmpeg Worker/WASM runtime，分别为浏览器原生与 non-native 路径未覆盖的高价值普通视频和独立音频组合提供本地播放 fallback
- 非目标：格式转换、编辑、录制、流媒体、DRM、DVD 菜单、完整 FFmpeg CLI 和“支持 FFmpeg 所有格式”的产品承诺
- 阶段关系：视频阶段 2 保持已完成；音频阶段 0–2 独立推进；视频专业能力与音频播放体验增强分别进入各自阶段 4

## 1. 方案决策

阶段 3 采用两个独立插件 `ffmpeg-video`、`ffmpeg-audio`，以及一套从锁定 FFmpeg 官方源码自行构建的共享只播放运行时。两个插件保留独立 manifest、probe、UI、支持矩阵和验收，但通过同一精确版本 URL 使用一份 Worker/WASM 资产。

运行时只在 `ffmpeg-video` 或 `ffmpeg-audio` 的完整实现被选中后加载，不进入 `/view` 首包、manifest、probe、browser/non-native 音视频插件或其他无关 chunk。浏览器缓存可以复用同一套版本化资产，构建产物和 plugin chunk 不得复制 WASM。

这不是直接安装完整 `ffmpeg.wasm`、libav.js 或 libmedia：

- 完整 CLI 分发包含转码、编码、封装、滤镜等本项目不需要的能力，API 也以命令执行为中心，不适合有界的持续播放会话；
- libav.js 的完整 npm 分发体积过大，裁剪后仍需要维护构建、bridge、许可和播放器接入，不能显著减少本项目真正的长期工作；
- libmedia 会引入另一套播放器与媒体抽象，但仍不能替代最终 FFmpeg fallback，形成两次集成和两套维护边界；
- 直接使用 FFmpeg libraries 可以从同一套 demux/decode 基础按真实需求增加组合，同时保留项目自己的加载、资源和 UI 约束。

阶段 3 的“fallback”是插件选择层级，不是宿主在 `open()` 失败后自动重试。宿主仍遵守插件协议：按扩展名产生候选，执行轻量 probe，按真实支持等级和注册顺序排序，只加载默认或用户选择的完整插件。共享 runtime 也不是面向用户的万能媒体插件。

## 2. 是否需要 fork FFmpeg

首期不 fork FFmpeg，也不需要 fork `ffmpeg.wasm`。

项目需要新增的是：

1. FFmpeg 官方 release 源码的精确版本与 SHA-256 锁定；
2. 精确锁定的 Emscripten 构建环境；
3. 项目维护的 configure/compiler/linker 参数；
4. 一个窄的 C adapter，把 FFmpeg libraries 转换为播放会话 API；
5. Worker、JavaScript glue、WASM 的可重复生成和完整性检查；
6. TypeScript Worker client、播放 provider、probe 与插件生命周期接入；
7. 固定媒体样例、真实浏览器 smoke、许可和部署材料。

这些属于“裁剪构建 + 项目 adapter”，不是修改 FFmpeg 核心源码。只有确认存在特定上游或 Emscripten 兼容问题时才增加有说明、有测试、可删除的 patch；长期或大范围 patch 出现后才重新评估正式 fork。

## 3. 插件边界与路由

```text
File
  │
  ├── browser-video
  │     └── 浏览器原生 <video>
  │
  ├── non-native-video
  │     ├── Mediabunny + WebCodecs
  │     └── OGV.js Ogg 专用软件路径
  │
  ├── browser-audio / non-native-audio
  │     └── 轻量音频路径
  │
  ├── ffmpeg-video（阶段 3）
  │     ├── 独立轻量、有界 video probe
  │     └── shared FFmpeg Worker/WASM → 规范化视频帧/PCM → Canvas/Web Audio
  │
  └── ffmpeg-audio（音频阶段 3）
        ├── 独立轻量、有界 audio probe
        └── shared FFmpeg Worker/WASM → Float32 PCM → Web Audio
```

FFmpeg 插件单列的原因是共享 runtime 具有独立的重型资产、源码构建、Worker、许可、安全和强制终止边界。它们不能替换已有的轻量插件：原生与 Mediabunny/OGV.js 路径体积更小，原生路径还能保留系统 decoder、浏览器 controls 和更低的内存带宽。

`ffmpeg-video` 和 `ffmpeg-audio` 不能合并：视频交付要求主视频节目和文件应有主音频均可播放；音频交付要求没有主视频节目、存在明确主音频节目，并使用不同 UI、路由和支持矩阵。attached picture 或 album cover 不视为主视频节目。

路由规则：

- 两个 manifest 只列出已经安排独立 probe 的扩展名，不使用 `"*"`；
- probe 按容器族和产品语义独立实现，只读取有界头尾分片，不加载 FFmpeg、Worker 或播放器；
- `ffmpeg-video` 只有完成端到端证据的容器 × 视频 codec × 音频 codec 子集才返回等级 3；
- `ffmpeg-audio` 只有完成端到端证据的容器/裸码流 × audio codec/profile/sample format × 声道子集才返回等级 3；
- 已由 `browser-video` 或 `non-native-video` 验证的组合继续由原插件返回更高或同级但注册顺序更优的等级；
- 已由 `browser-audio` 或 `non-native-audio` 验证的组合同样保持轻路径优先；
- audio-only 对 `ffmpeg-video` 返回 0；含主视频节目的文件对 `ffmpeg-audio` 返回 0；损坏、超限或对应主轨不可解的文件返回 0 或由 `open()` 返回准确错误；
- 不依据 FFmpeg 编译时存在某个 demuxer/decoder 就扩大 manifest 或产品文案。

视频首批可能涉及 `.avi`、`.mpg`、`.mpeg`、`.vob`、`.asf`、`.wmv`；音频首批 spike 候选包括 `.aif`、`.aiff`、`.aifc`、`.wma`、audio-only `.asf` 和 `.ape`。最终扩展名和组合必须由 spike 与固定样例确认后再写入各自 manifest。

## 4. 运行时架构

```text
主线程
  ffmpeg-video 或 ffmpeg-audio UI / playback session
       │ File + 命令
       ▼
专用 Worker
  TypeScript Worker endpoint
       │
  project C adapter
       │
  libavformat ── demux / seek
  libavcodec  ── video/audio decode
  libswscale  ── 必要的视频像素格式归一化
  libswresample ─ 音频 Float32 PCM 归一化
  libavutil
       │
       ├── metadata / selected tracks / state / error
       ├── 有界视频 frame buffers（视频插件）
       └── 有界 PCM buffers（两个插件）
```

专用 Worker 是必需边界：同步文件读取、demux/decode 和 WASM 内存都不阻塞主线程；取消无法及时穿透第三方代码时，终止 Worker 是最终的硬取消和资源回收手段。Worker/WASM 仍不被视为不可信输入的安全沙箱，输入大小、偏移、维度、轨道和队列仍必须在应用层限制。

首期以单线程共同运行时为基线。只有实测表明已选视频或音频组合无法实时播放，才评估 pthread variant；不能仅因为 `/view` 已跨源隔离就默认承担多线程资产、兼容性和内存成本。不得为两个插件分别构建无测量依据的 runtime variant。

## 5. FFmpeg 构建范围

首个 spike 先做“关闭整个无关能力类别”的宽 decoder 构建，用测量决定是否继续做逐项 allowlist。过早维护长 demuxer/decoder 清单容易漏掉 parser、bitstream filter 和隐含依赖，也会让每次扩展格式都先修改构建系统。

初始裁剪意图：

- 不构建 `ffmpeg`、`ffprobe`、`ffplay` 等 programs；
- 禁用 encoders、muxers、filters、devices、indevs、outdevs、network 和文档；
- 不加入 x264、x265、libxvid 等编码用外部库；H.264/HEVC 等使用 FFmpeg 自身 decoder；
- 保留 `libavformat`、`libavcodec`、`libavutil`、`libswscale` 与 `libswresample`；
- 只保留本地 `file` 输入协议，不允许网络协议；
- 尽量关闭自动探测到的无关系统库，并在 `build-info.json` 记录最终 configure 输出；
- release 构建去除调试符号，但保留可定位版本、错误码和构建配置的审计信息。

如果宽 decoder 版本仍超过阶段预算，第二步才切换到显式 demuxer、decoder、parser 和 bitstream filter allowlist。每次新增组合必须同时更新固定样例、构建 smoke 与体积基线，不能只打开一个 configure flag。

是否启用 SIMD、异常处理、内存增长、BigInt/64-bit 偏移和 pthread，必须由目标浏览器的大文件、性能和产物测量决定。精确 FFmpeg 与 Emscripten 版本也在 spike 后锁定，不在规划阶段使用 `latest` 或浮动 tag。

## 6. 项目自有播放 bridge

不向前端暴露 FFmpeg CLI 命令或大面积 `libav*` API。C adapter 提供小而稳定的会话能力：

```text
open(mountedPath)       → 媒体、节目与轨道信息
select_tracks(video?, audio?) → 锁定插件已验证的主轨组合
decode_next()           → video-frame | audio-frame | eof | error
seek(timestamp)         → 定位到可恢复解码的位置
flush()                 → 清空 decoder 与 adapter 队列
close()                 → 释放 format/codec/frame/packet/buffer
set_abort_flag()        → 尽可能中断 FFmpeg I/O 或长操作
```

内部实现覆盖 `avformat_open_input`、`avformat_find_stream_info`、受插件约束的主轨选择、decoder 打开、`av_read_frame`、packet/frame send/receive、时间戳换算、`avformat_seek_file`、`avcodec_flush_buffers`、像素/采样格式转换和完整清理。runtime 不得自行把 attached picture 选成视频节目，也不得在多主轨语义不明确时静默决定产品行为。

bridge 输出必须是有所有权约定的有界事件，而不是把 FFmpeg 指针暴露给 JavaScript。每个 buffer 明确由谁释放，seek/generation 变化后旧 frame 不能再进入 UI。错误至少能区分损坏文件、不在声明范围、资源超限、环境初始化失败和取消。

## 7. 大文件与文件 I/O

主线程把浏览器 `File` 通过 structured clone 交给专用 Worker；Worker 使用 Emscripten WORKERFS 挂载并进行同步随机读取，避免在打开时把完整文件复制进 WASM heap。该能力只能在 Worker 中使用。

spike 必须验证：

- 文件不会因打开或 seek 被整体 `arrayBuffer()`；
- 大于 2 GiB 的偏移、长度和 seek 没有 32-bit 截断；
- 文件尾索引和反向 seek 的读取量可解释；
- 关闭或终止 Worker 后 File、挂载点、WASM memory 和回调均不可继续使用；
- 畸形索引不能触发无上限扫描、分配或递归。

如果 WORKERFS 在目标浏览器或大文件路径上不能满足正确性，再评估项目自有的同步分片 I/O bridge。不能用一次性复制完整文件作为正式 fallback。

## 8. 输出与现有播放管线接入

视频首期归一化为 8-bit I420 或 NV12 plane，必要时使用 `libswscale`；不默认从 Worker 传输全尺寸 RGBA，因为它会显著增加带宽和内存。主线程用可转移 `ArrayBuffer` 构造 `VideoFrame` 或直接绘制 Canvas，并保持固定数量的帧槽。

音频使用 `libswresample` 归一化为 Float32 PCM，通过 Web Audio 时钟播放。音频插件必须记录重采样、声道重排/下混、encoder delay/padding 和 gapless 的已知限制，不能把可播放误报为 bit-perfect。视频的 10/12-bit、HDR、精确色彩、alpha、隔行和专业像素语义可以作为等级 3 的已知限制，但不能在转换后误报为无损或专业准确。

当前 `non-native-video` 播放会话与 Mediabunny sink 直接耦合，且要求 Canvas/video track。FFmpeg spike 和一个真实 `non-native-audio` vertical slice 成功后，提取最小的内部 provider 与 PCM 调度边界，而不是把现有视频类直接用于独立音频：

```ts
interface DecodedVideoProvider {
  initialize(): Promise<MediaInfo>
  videoFrames(from: number): AsyncIterable<DecodedVideoFrame>
  audioFrames(from: number): AsyncIterable<DecodedAudioFrame>
  seek(time: number): Promise<void>
  dispose(): Promise<void>
}

interface DecodedAudioProvider {
  initialize(): Promise<AudioMediaInfo>
  audioFrames(from: number): AsyncIterable<DecodedAudioFrame>
  seek(time: number): Promise<void>
  dispose(): Promise<void>
}
```

Mediabunny 和 FFmpeg 分别实现需要的 provider。音视频可以复用 PCM lookahead、AudioContext 时钟、gain、seek generation、结束、重播和清理；只有视频层处理 Canvas、A/V sync 和视频帧背压。接口属于内部实现边界，不加入查看器公共协议，也不预先演化成通用媒体框架；OGV.js 可以在收益明确前保持现有专用路径。

## 9. 源码构建与资产交付

目录遵守项目的源码构建型依赖规范：

```text
tools/ffmpeg-playback-build/
├── Dockerfile
├── build.sh
├── ffmpeg-playback-bridge.c
├── upstream.json
├── patches/
└── smoke-test.mjs

third_party/ffmpeg-playback/<upstream-version>-anyfile.<revision>/
├── ffmpeg-playback.js
├── ffmpeg-playback.wasm
├── ffmpeg-playback.worker.js
├── build-info.json
├── SOURCE.md
└── LICENSES/

public/vendor/ffmpeg-playback/<upstream-version>-anyfile.<revision>/
└── prepare 阶段校验哈希后生成，不提交 Git
```

普通 `pnpm dev`、`pnpm test` 和 `pnpm build` 不现场编译 FFmpeg，也不下载浮动产物；它们只校验并复制已审核的版本化资产。插件 URL、prepare、构建门禁、许可证和 `build-info.json` 必须引用同一产物版本。

FFmpeg 构建的许可证取决于最终 configure 选项和链接组件。首期避免 GPL/nonfree 外部组件，以 LGPL 路径为目标，但合并前仍必须完成实际 configure 输出、对应源码/重新链接义务、NOTICE 和 codec 专利风险评审；本文不替代法律结论。

## 10. 分批实施

### 3.0 运行时 spike

先不做产品 UI，仅用固定文件完成：

```text
open → 主轨信息 → 第一帧/第一段音频 → 连续解码 → seek → close
```

视频代表组合：

1. AVI + MPEG-4 Part 2/Xvid + MP3；
2. MPEG-PS/VOB + MPEG-2 Video + AC-3，并补一个 MP2 音频对照；
3. ASF/WMV + Windows Media Video + WMA。

音频代表组合：

1. AIFF/AIFC + PCM 代表 sample format；
2. ASF audio-only + WMA 代表组合；
3. APE 代表版本与压缩等级。

同时准备 video-only、audio-only、attached picture、多主轨、损坏、截断、不支持 codec 和资源超限样例。audio-only 是 `ffmpeg-video` 的反例，也是 `ffmpeg-audio` 的正常/反例语料；含主视频节目则相反。记录 WASM/JS/Worker raw 与 gzip 体积、每组 demuxer/decoder 的增量、初始化和首帧/首 buffer 时间、持续解码帧率或实时倍速、CPU、峰值/稳定内存、seek 延迟、读取量和取消完成时间。

### 3.1 首批插件交付

只有 spike 达到体积、实时播放、内存、seek、取消、许可和部署门槛后才：

- 锁定正式 FFmpeg/Emscripten 版本与构建配置；
- 分别确定首批视频容器 × 视频/音频 codec 组合、音频容器/裸码流 × codec/sample format 组合和 manifest 扩展名；
- 实现独立 video/audio probe 与 `ffmpeg-video`、`ffmpeg-audio` registration；
- 接入各自 decoded provider、播放 session 和 UI；
- 添加 prepare、哈希、许可证、响应头和 bundle 门禁；
- 以真实目标浏览器完成音视频各自的端到端与生命周期验收。

### 3.2 按证据扩展

视频后续按真实使用价值增加 FLV、其他 AVI/MPEG-PS/ASF、普通 MOV/3GPP 或其他历史组合；音频后续按价值评估 Musepack、AMR、AC-3/E-AC-3、Sun/NeXT、RealAudio 和更多 AIFF/WMA/APE 变体。每批只增加有固定样例、独立 probe 和完整播放证据的组合。专业 MOV/MXF、timecode、专业色彩、BWF/ADM 等领域语义属于各自后续阶段，即使底层 decoder 已存在也不能自动并入阶段 3。

## 11. 阶段验收标准

每个正式声明组合必须满足：

- 只处理本地 `File`，不上传、不联网读取容器引用，也不整体复制大文件；
- FFmpeg 资产只在 `ffmpeg-video` 或 `ffmpeg-audio` 完整实现被选中后加载，且只有一份精确版本产物；
- 视频 `open()` 在真实首个视频帧，以及文件存在主音频时的首个可用音频 buffer 已准备后返回；音频 `open()` 在首个时间戳和长度有效的 PCM buffer 与可销毁播放链准备后返回；
- 连续播放、暂停、音量、前后与快速 seek、结束和重播可用；视频组合另需 A/V sync；
- 用户手势前不自动播放或发声，静音首 buffer 不被误判为损坏；
- 队列、WASM memory、尺寸、轨道、索引、probe 和读取工作量有边界；
- opening abort、active abort、切换与重复 dispose 都能停止 Worker、声音、帧和回调；
- 损坏、不支持 codec、资源超限和环境失败准确映射；视频不静默丢弃应有主音频，音频不静默选择未实现的多主轨；
- 产物、源码、版本、哈希、构建配置、许可证、部署响应头和 CSP 可审计；
- `/view` 首包、manifest、probe、browser/non-native 音视频插件与无关 chunk 不包含 FFmpeg；
- 自动协议测试、插件测试、真实浏览器 smoke、`pnpm test`、`pnpm lint` 和 `pnpm build` 通过。

## 12. Spike 后需要锁定的决策

- 精确 FFmpeg release、Emscripten 版本和构建容器 digest；
- 宽 decoder 构建是否达到体积目标，是否需要 demuxer/decoder allowlist；
- 单线程是否足够，是否需要 SIMD 或 pthread variant；
- WORKERFS 在目标浏览器和大文件上的偏移、seek 与内存结果；
- 首批正式视频/音频支持组合、各自扩展名和 probe 预算；
- 视频 plane 的最终传输格式与浏览器绘制路径；
- 运行资产放同源部署还是受控资产域名，以及对应离线行为；
- 最终许可证、对应源码分发和 codec 专利决策。

这些问题在测量前保持显式开放，不能用“FFmpeg 支持”替代项目自己的实现和验收证据。

## 13. 相关文档

- [视频查看实施路线图](roadmap.md)
- [视频查看架构](architecture.md)
- [视频格式支持矩阵](support-matrix.md)
- [音频查看实施路线图](../audio/roadmap.md)
- [音频查看架构](../audio/architecture.md)
- [音频格式支持矩阵](../audio/support-matrix.md)
- [格式查看器插件协议](../viewer-plugin-protocol.md)
- [查看器插件渲染规范](../viewer-render-tips.md)
- [查看器加载、渲染与部署约定](../viewer-loading-and-deployment.md)
- [源码构建型第三方依赖规范](../viewer-source-built-dependencies.md)
- [FFmpeg 官方下载与源码发布](https://ffmpeg.org/download.html)
- [FFmpeg 法律与许可证说明](https://ffmpeg.org/legal.html)
- [Emscripten 文件系统与 WORKERFS](https://emscripten.org/docs/api_reference/Filesystem-API.html#workerfs)
