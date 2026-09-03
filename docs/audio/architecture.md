# 音频查看架构

- 状态：阶段 0 已完成；`browser-audio` 与 `non-native-audio` 已实现，跨浏览器完整验证继续按支持矩阵补证
- 适用范围：浏览器本地打开的独立音频与 audio-only 容器文件
- 不包含：视频内音频、流媒体、DRM、录音、编辑、转码和服务端处理

## 1. 设计目标

- 常见组合优先使用 `<audio>` + Object URL，保留浏览器 controls 和较低资源成本；
- 支持声明绑定容器/裸码流、codec/profile/sample format、声道、时间轴和真实环境；
- probe 只做有界识别与排序，完整插件以真实媒体加载或首个 decoded buffer 为准；
- 大文件不整体复制进 JS/WASM，不预解码完整 PCM，不为首期波形扫描全文件；
- 连续播放、暂停、音量、基础 seek、结束、重播和完整资源释放属于交付底线；
- 重型 demuxer、WebCodecs 路径、Worker/WASM 和 FFmpeg 只在对应完整插件打开后加载；
- 音频文件不上传，不自动访问标签或播放列表中的远程资源；
- abort、dispose、DOM 所有权和错误码遵守现有插件协议。

## 2. 支持单位

```text
容器或裸码流组织
  × codec / profile / sample format
  × sample rate / channel layout
  × 时长、seek、delay/padding 和多轨语义
  × 浏览器 / 操作系统 / 硬件环境
```

支持矩阵可以合并实现和证据完全相同的组合，不能用“MP3”“WAV”“M4A”概括未经验证的变体。

## 3. 插件边界

```text
File
  │
  ├── 扩展名候选
  ▼
有界音频 probe
  ├── 容器/裸码流签名与结构
  ├── 主音频轨、codec 与关键配置
  ├── 主视频节目/attached picture 区分
  ├── 时长或 seek 证据
  └── 声明组合与环境基础能力
  │
  ▼
动态支持等级与稳定排序
  │
  ├── browser-audio
  │     └── Object URL → <audio controls>
  ├── non-native-audio
  │     └── Mediabunny demux → WebCodecs/PCM → Web Audio
  └── ffmpeg-audio
        └── shared FFmpeg Worker/WASM → Float32 PCM → Web Audio
```

三个插件是产品、路由和验收边界，不要求三套重复的 FFmpeg 资产：`ffmpeg-audio` 与 `ffmpeg-video` 共享一个锁定、版本化的 decode-only FFmpeg runtime，但保留独立 manifest、probe、UI 和支持矩阵。

## 4. 插件族职责

| 插件族 | 目标范围 | 主要路径 |
|---|---|---|
| browser audio | 目标环境实际可由 `<audio>` 播放的 MP3、WAVE、M4A/MP4、Ogg、WebM、FLAC、ADTS 等具体组合 | `<audio controls>` + Object URL |
| non-native audio | 浏览器媒体元素不能稳定播放，但 Mediabunny 能分片 demux、PCM 或 WebCodecs 能解码的组合 | BlobSource + AudioBufferSink + Web Audio |
| FFmpeg audio fallback | 前两条路径未覆盖、且通过体积、性能、许可和端到端证据的高价值 AIFF/WMA/APE 等组合 | 共享 FFmpeg Worker/WASM + audio adapter |

不规划 metadata-only、cover-only 或 waveform-only 音频插件。Hex 等通用检查插件仍可作为等级 1 fallback。

## 5. 与视频插件的竞争

`.mp4`、`.webm`、`.ogg`、`.asf` 等扩展名可以同时产生音频和视频候选。路由必须按内容互斥：

- 存在可播放主视频节目时，音频 probe 返回 0；
- 不存在主视频节目、存在一个可播放主音频节目时，视频 probe 返回 0，音频插件按路径返回等级 3；
- attached picture、album cover 或 timed metadata 不算主视频节目；
- 多节目或多主轨语义没有实现时保守返回 0，不能静默选择；
- 原生、非原生和 FFmpeg 音频候选同级时，注册顺序保持轻路径优先；
- 默认插件 `open()` 失败时仍不由宿主自动尝试下一插件。

注册时保持现有 `browser-video`、`non-native-video` 的相对顺序不变；音频内部保持 `browser-audio` → `non-native-audio` → `ffmpeg-audio` 的轻路径优先，`ffmpeg-video` 也继续位于已有视频路径之后。音视频 probe 必须正确互斥，不能依赖注册顺序掩盖 audio-only 被视频插件截获的问题。

## 6. browser-audio 原生路径

```text
有界复验容器/帧与主音轨
        ↓
创建插件根节点与 <audio controls>
        ↓
File → Object URL → audio.src
        ↓
等待真实媒体数据可用，或 media error / abort
        ↓
展示可靠基础元数据并返回 controller
```

要求：

- 不依赖扩展名或 `canPlayType()` 直接返回成功；
- `loadedmetadata` 只证明标签/时长可能可读，不足以单独证明音频数据可播放；
- 不 autoplay，不为验证输出而在 `open()` 中发声；
- 原生 controls 负责播放、暂停、音量、seek 和基础无障碍行为；
- 文件名、容器、codec、sample rate、声道、时长只展示可靠取得的信息；
- dispose 幂等执行 pause、移除监听与 source/src、`load()`、revoke Object URL、移除根节点。

实时可视化曲线由 `@anyfile/viewer-rendering/audio` 的 `AudioVisualizer` 绘制，接入约束：

- `open()` 阶段只登记 `<audio>` 的 `play`、`pause`、`ended` 监听，不创建 AudioContext、不接管元素输出、不发声；
- AudioContext 只在用户触发的 `play` 事件内创建，`resume()` 后必须确认 `state === "running"` 才允许调用 `createMediaElementSource()`；
- `resume()` 失败或仍为 suspended 时，立即关闭该 context 并放弃可视化；宁可不显示曲线，也不能让原生路径静音；
- 接管成功后先连 `source → destination` 保住可听通路，再挂 analyser 旁路；
- 只用 `AnalyserNode` 的实时读数，不用 `decodeAudioData()`或整轨峰值扫描，保持第 1 节“不预解码完整 PCM、不为首期波形扫描全文件”；
- 可视化画布自身就是效果开关：`AudioVisualizer` 在它接到的那个 canvas 上监听 `click` 与 `keydown`（Enter/Space）循环切换 spectrum/waveform，切换时重设 `smoothingTimeConstant` 并补一帧；该交互不创建 AudioContext、不改变播放状态，也不改变上述音频图所有权；
- 因为画布可交互，插件必须自己把它设为 `role="button"`、`tabindex="0"` 并给本地化的 `aria-label` 与 `title`，`cursor` 与 `:focus-visible` 轮廓也在插件 CSS 里；visualizer 不写 canvas 属性也不注入样式，漏掉 `tabindex` 只会静默失去键盘可达性；
- dispose 关闭自建 AudioContext、断开 source/analyser、停止 `requestAnimationFrame` 与 `ResizeObserver`，并移除画布上的激活监听。

## 7. non-native-audio 路径

项目已锁定的 Mediabunny 1.55.3 能解析 MP3、WAVE、Ogg、FLAC、ADTS、MP4/QuickTime、Matroska/WebM 等输入，并提供 `AudioBufferSink`。这只是候选基础，不等于所有格式和 codec 均已支持。当前 `non-native-audio` 只声明已验收的 Matroska audio-only 与 WAVE A-law / μ-law；Ogg FLAC、ALAC、ADPCM 与 HE-AAC 等缺口见支持矩阵。

完整路径：

```text
File
  → BlobSource（有界缓存）
  → Input（显式 expected format）
  → 主音轨、codec、时长、首时间戳与 canDecode 复验
  → AudioBufferSink
  → 有界 PCM iterator
  → AudioContext + GainNode + AudioBufferSourceNode
```

`open()` 在首个时间戳和长度有效的 buffer 解码成功、播放 UI 和清理链建立后返回。AudioContext 可以延迟到首次用户播放时创建或恢复；不能为了等待用户手势阻塞 `open()`。

同一个 `AudioVisualizer` 在本路径以 `node` 模式挂在 `#gain` 上：`gain.connect(analyser)` 是纯旁路，`gain → destination` 的可听通路和 AudioContext 生命周期仍由 session 拥有，visualizer 不创建也不关闭它。播放状态由 `#setPlayState()` 与 `#cancelPipeline()` 驱动，因此暂停、seek、解码失败、自然结束和 dispose 都会停止动画循环。两条路径共用同一套画布点击切换效果的行为，各自的 canvas 无障碍属性和 CSS 由本插件 `ui.ts` 自己给。

音频 session 首期独立实现，不直接复用当前强依赖 Canvas/video track 的 `non-native-video/PlaybackSession`。完成一个真实 audio-only vertical slice 后，再提取以下最小重复能力：

- PCM lookahead 与 AudioBufferSourceNode 调度；
- AudioContext 时钟、gain、暂停和当前位置；
- seek generation、旧 iterator/source 取消；
- 结束、重播与幂等 dispose。

不预建公共 `MediaPlayer`、`MediaDocument`、统一媒体工具栏或加入查看器公共协议。

## 8. FFmpeg 共享运行时

FFmpeg 只作为最后一层。底层共享：

```text
@anyfile/ffmpeg-playback-runtime（内部边界）
  ├── Worker endpoint / client
  ├── project C adapter
  ├── WORKERFS 或经验证的同步分片 I/O
  ├── libavformat / libavcodec / libavutil
  ├── libswscale（视频使用）
  └── libswresample（音视频音轨共同使用）
       ├── ffmpeg-video adapter
       └── ffmpeg-audio adapter
```

共享 runtime 不意味着共享插件：

- `ffmpeg-video` 要求主视频节目和应有主音频均可播放；
- `ffmpeg-audio` 要求没有主视频节目、存在明确主音频节目；
- 两者各自执行轻量 probe，完整 runtime 只在选中任一完整插件后加载；
- 同一精确版本的 JS/Worker/WASM 资产通过版本化 URL 复用浏览器缓存，不复制到两个 plugin chunk；
- FFmpeg 编译存在某个 demuxer/decoder 不自动扩大任一 manifest 或支持文案。

底层 C/session API 支持按选定轨道输出有所有权约定的有界事件。音频 adapter 只接收 metadata/state/error 和 Float32 PCM，不暴露 FFmpeg 指针或 CLI。

详细方案见[FFmpeg 音视频播放 fallback 接入方案](../videos/ffmpeg-playback-runtime-plan.md)。

## 9. Probe 与资源边界

Probe 的初始预算在阶段 0 通过真实样例测量后锁定，不自动照抄视频 512 KiB。规划基线：

- 优先读取小型头部；需要尾部 tag/index 时增加独立尾片；
- 限制 tag、box、block 的实际读取字节和访问项；ID3/APIC 与 FLAC metadata 根据已校验长度使用范围读取跳过正文，不因封面正文较大而整体读取或拒绝；
- 限制为寻找首帧而跳过的 tag 字节和扫描的音频帧数；
- 不解析或解码封面，不建立完整波形，不遍历完整帧流；
- 无法在预算内取得 codec、主轨和基本 seek 证据时保守返回 0；
- probe 不创建 `<audio>`、AudioContext、AudioDecoder、Worker 或 WASM。

自定义播放路径至少限制：

- Blob cache、轨道数、sample rate、channel count、单 buffer frames/bytes；
- PCM lookahead 总时长和总字节；
- duration、timestamp、sample count 乘法和安全整数；
- seek/index 工作量、并发 iterator 和 pending source 数；
- Worker/WASM memory、解码 CPU 预算和硬取消时间。

## 10. UI 与可访问性

- 根节点填满容器，内部布局不制造双滚动；
- 原生路径保留 `<audio controls>` 的键盘和无障碍能力；
- 自定义 controls 的播放、seek、音量均提供可访问名称和 focus-visible；
- 很窄或很矮的窗口仍可访问播放与 seek；
- 不渲染整文件 waveform 和大封面；实时频谱曲线允许，但只能来自 `AnalyserNode` 的流式读数，不得为此解码或扫描全文件；
- 频谱曲线是装饰元素，标记 `aria-hidden="true"`，不承载播放信息，也不取代原生 controls 或自定义 controls 的键盘能力；
- 很矮的窗口直接隐藏曲线；`prefers-reduced-motion: reduce` 时不启动动画循环，只保留静止基线；
- 错误使用局部 `role="alert"`，状态使用 `role="status"`；
- 不覆盖页面缩放、全局快捷键或宿主样式。

## 11. 生命周期与错误

opening abort、active abort、文件切换和重复 dispose 走统一清理逻辑：

1. 标记 generation/实例失效；
2. pause 并停止所有已排 AudioBufferSourceNode；
3. 取消 iterator、decoder、Worker 请求和定时器；
4. 移除监听和 Object URL/media src；
5. 关闭 AudioContext、Input、Worker/WASM 与文件挂载；
6. 移除插件根节点。

错误映射：

- 损坏、伪装、缺失主音轨或不在声明子集：`invalid-file`；
- 当前浏览器缺少媒体/WebCodecs/Web Audio/Worker/WASM 能力：`unsupported-environment`；
- tag、轨道、PCM、索引、WASM memory 或计算工作量超限：`resource-limit`；
- 无法归类的初始化失败：`open-failed`；
- 取消保持标准 `AbortError`。

## 12. 加载、隐私和部署

- manifest 只包含静态声明；probe 与完整插件为独立动态入口；
- Mediabunny 不进入 `/view` 首包或 `browser-audio` chunk；
- 共享音频可视化只走 `@anyfile/viewer-rendering/audio` 子入口，不从 `viewer-rendering` 根入口重新导出；它不进入 `/view` 首包、任一音频 probe chunk，也不得把 Mediabunny 带进图片插件 chunk；
- FFmpeg JS/Worker/WASM 不进入首包、manifest、probe、browser/non-native audio 或无关视频 chunk；
- 普通应用构建不现场编译或下载 FFmpeg；只校验并复制已审核版本化产物；
- 文件、文件名、标签、PCM 和封面不上传，不自动请求标签内 URL；
- FFmpeg 构建、许可证、对应源码、哈希、CSP、COOP/COEP 和 bundle 门禁遵守源码构建依赖规范。

## 13. 相关文档

- [音频查看相关概念](concept.md)
- [音频格式与编码候选清单](format-inventory.md)
- [音频格式支持矩阵](support-matrix.md)
- [音频查看实施路线图](roadmap.md)
- [视频查看架构](../videos/architecture.md)
- [FFmpeg 音视频播放 fallback 接入方案](../videos/ffmpeg-playback-runtime-plan.md)
- [格式查看器插件协议](../viewer-plugin-protocol.md)
- [查看器插件渲染规范](../viewer-render-tips.md)
- [共享 UI 与渲染基础设施决策记录](../viewer-ui-and-rendering-proposal.md)
- [查看器加载、渲染与部署约定](../viewer-loading-and-deployment.md)
- [源码构建型第三方依赖规范](../viewer-source-built-dependencies.md)
