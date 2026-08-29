# 视频查看架构

- 状态：阶段 0、阶段 1 与阶段 2 首批 Matroska 播放路径已验收
- 适用范围：浏览器本地打开的视频文件
- 不包含：独立音频、流媒体、DRM、编辑、转码和服务端处理

## 1. 设计目标

视频查看架构需要同时满足：

- 在达到可播放、安全和生命周期底线后，优先扩大可播放的容器与 codec 组合；
- 常见浏览器原生组合保持简单，优先使用 `<video>` 和 Object URL；
- 支持声明绑定容器、视频 codec、音频 codec、关键配置和真实环境；
- probe 只做有界识别与排序，完整插件仍以真实媒体加载结果为准；
- 大文件不因插件实现而复制完整编码内容或展开全部帧；
- 连续播放、应有主音频、基础 seek 和资源释放属于播放底线；
- 方向、多轨、字幕、色彩和 HDR 等缺失如实记录，但不默认阻塞下一个格式；
- 重型 parser、demuxer、Worker、WASM 和 decoder 只在对应插件打开后加载；
- abort、dispose、DOM 所有权和本地处理遵守现有插件协议。

## 2. 支持单位

视频的支持单位不是扩展名，也不是单独的容器或 codec，而是：

```text
容器组织
  × 视频 sample entry / codec / profile / level / bit depth
  × 音频 codec / 声道
  × 时间轴、seek、轨道和字幕语义
  × 浏览器 / 操作系统 / 硬件环境
```

支持矩阵可以合并具有相同实现和证据的组合，但不能用“MP4”“MOV”或“H.264”概括未经验证的变体。

## 3. 与插件协议的关系

视频插件沿用项目统一的两阶段路由：

1. 宿主按文件名和扩展名产生候选；
2. 候选按需加载轻量 `probe()`；
3. probe 有界读取容器头、轨道描述和 codec 配置，并按插件声明的 codec 子集返回 0–5；
4. 宿主按动态等级和注册顺序稳定排序；
5. 只加载默认或用户选中的完整插件；
6. `open(context)` 按插件路径创建 Object URL，或初始化 demux、WebCodecs、Canvas 与 Web Audio；
7. 切换时先 abort，再幂等 dispose 并清理容器。

`canPlayType()`、Media Capabilities 或未来 `VideoDecoder.isConfigSupported()` 都不能证明当前容器索引、所有轨道、真实样本和 seek 可用。当前 probe 不调用这些 API，也不创建媒体元素；环境能力由 `open()` 的真实媒体事件判定。

## 4. 总体数据路径

```text
File
  │
  ├── 扩展名候选
  │
  ▼
有界容器 probe
  ├── 容器与结构
  ├── 视频轨道与 codec 配置
  ├── 音频/字幕轨道摘要
  └── 声明 codec 子集
  │
  ▼
动态支持等级与插件排序
  │
  ▼
完整插件
  ├── browser-video → Object URL → <video>
  ├── non-native-video → Mediabunny demux → WebCodecs → Canvas / Web Audio
  └── future professional video → 领域 demux/decoder → 专业播放管线
```

这不是所有视频必须经过的统一流水线。原生路径不应为了统一而自行 demux 或逐帧画到 Canvas。

## 5. 建议插件族

| 插件族 | 目标范围 | 主要路径 |
|---|---|---|
| browser video | 浏览器可原生播放的 MP4/WebM 等具体组合 | `<video controls>` + Object URL |
| non-native video | 浏览器不能原生播放、但用户价值明确的 Matroska、AVI、MPEG-PS/TS 等组合 | 容器 demuxer + 选定 decoder + 最小播放管线 |
| professional video | MOV/MXF 中的 ProRes、DNx、timecode 等 | 领域 demux/decoder + 专业交互 |

这些边界是控制依赖和产品语义的规划工具，不是公共接口。阶段 1 使用 `browser-video`，阶段 2 的首批 Matroska 组合使用 `non-native-video`。

不规划面向用户的 metadata-only 视频插件。容器和轨道解析只服务于 probe、错误诊断及实际播放管线；不能播放主要内容的候选返回 0，不以“可检查 metadata”占据视频查看器位置。

同一扩展名可以由多个播放插件竞争。例如未来 `.mov` 文件中浏览器可播放的 AVC 由 browser video 返回较高等级，包含 ProRes 的文件由 professional video 返回更高等级。没有视频轨道的 `.mp4` 或 `.ogg`，视频 probe 应返回 0，留给未来音频插件。

## 6. 阶段 1 原生播放路径

阶段 1 使用原生 `<video controls>`，不自建播放控制器：

```text
校验非空与有界容器结构
        ↓
构造可靠的 MIME + codecs（能够可靠取得时）
        ↓
创建 Object URL
        ↓
设置 video.src 与原生 controls，不 autoplay
        ↓
等待 metadata + 第一帧可用，或 media error / abort
        ↓
挂载文件名与经过验证的基础元数据
```

打开成功不能只等待 `loadedmetadata`：它可能证明容器元数据可读，却不能证明首个视频样本可解码。阶段 1 已用真实浏览器验证 `loadeddata` 作为首帧完成条件；超时仍由宿主取消控制，不在插件内设置无依据的固定时限。

原生控件负责播放、暂停、音量、基础 seek 和浏览器提供的无障碍语义。首期不复制这些能力，也不通过 Canvas 截获正常播放。

## 7. Probe 边界

Probe 的目标是安全排序，不是完整媒体分析：

- 只读取识别容器和主要轨道配置所需的有界分片；
- MP4/MOV 不能假定 `moov` 一定在文件头，需要定义尾部分片或降级策略；
- WebM/Matroska 使用有界 EBML 解析，限制元素尺寸、嵌套深度和轨道数量；
- 不遍历全部 sample、cluster、fragment 或 packet；
- 不初始化完整 demuxer、decoder、Worker 或 WASM；
- 无法在预算内取得 codec 配置时，可以保守降级，不得根据扩展名返回虚假的高等级；
- 损坏的 A/V 轨道或声明 codec 组合之外的文件返回 0；无法识别或明确为非 A/V 的辅助轨道不否决已有合法主 A/V 轨道；probe 不创建媒体元素，真实环境失败由 `open()` 的媒体错误返回；没有播放实现时不保留 metadata-only 候选。

阶段 0 已用固定真实样例完成测量，初始预算为头部 256 KiB + 尾部 256 KiB、总读取 512 KiB、嵌套深度 12、轨道 32、访问项 4,096。完整观测值和调整规则见[阶段 0 验收证据](stage-0-evidence.md)。该预算来自视频样例，不是自动沿用图片阈值。

## 8. UI 与布局

阶段 1 采用内部固定工具栏、单一视频内容区域：

- 根节点 `height: 100%`、`min-height: 0`、`overflow: hidden`；
- 视频区域填充剩余空间并居中；
- `<video>` 使用容器约束和 `object-fit: contain`，保持浏览器计算的显示比例；
- 不提供图片式拖拽、任意旋转、1:1 像素和滚轮缩放；
- 文件名、容器、显示尺寸、时长等只展示已可靠取得的信息；
- 很窄或很矮的窗口仍能访问原生 controls；
- 不覆盖浏览器页面缩放、快捷键和媒体无障碍行为。

`InteractiveViewport` 和 `CanvasSurface` 不属于阶段 1 复用范围。`ResourceScope`、主题变量和 DOM/lifecycle 测试基础可以直接复用。

## 9. 生命周期与资源清理

视频实例至少拥有 Object URL、媒体加载、事件监听和潜在的浏览器解码资源。dispose 必须幂等，并按验证过的顺序完成：

1. 标记实例不再接受异步回调；
2. `pause()`；
3. 移除媒体事件和其他监听；
4. 移除 `src` 和插件创建的 `<source>`；
5. 触发媒体元素停止当前资源加载的标准清理路径；
6. 撤销 Object URL；
7. 移除插件根节点。

opening abort、active abort、切换文件和重复 dispose 必须走同一套清理逻辑。dispose 后不允许继续播放、写 DOM 或报告进度。

## 10. 资源、安全与隐私

- 原生路径把原始 `File` 通过 Object URL 交给浏览器，不复制完整文件，不展开全部帧；
- 不因缺乏依据而给所有原生视频设置统一文件大小、时长或像素上限；
- 自定义 parser/demux/decode 路径必须按真实分配模型限制 box/element、轨道、sample、索引、分辨率、帧缓存、音频缓冲和并发；
- 所有偏移、长度、时间和内存乘法在分配或 seek 前检查安全整数和越界；
- 不上传文件、文件名、路径、帧、音轨或 metadata；
- 不自动打开容器中的外部 URL、attachment 或字幕引用；
- 不支持 DRM 或绕过浏览器/系统的访问控制；
- 达到自定义实现边界返回 `resource-limit`，损坏文件返回 `invalid-file`，缺少环境能力返回 `unsupported-environment`。

## 11. 非原生播放管线的进入条件

阶段 2 首批已交付 `.mkv`/`.mk3d` 的 Matroska 路径：Mediabunny 1.55.3 通过 `BlobSource` 分片读取和 demux，WebCodecs 解码主视频/音频，Canvas 输出画面，AudioContext 作为播放时钟。首批视频集合为 AVC、HEVC、VP8、VP9、AV1，主音频集合为 AAC、Opus、Vorbis、MP3、FLAC，并支持 video-only。

后续仍按用户价值逐个选择浏览器不能原生播放的容器与 codec 组合。WebCodecs 或 WASM decoder 不做万能 fallback；每个组合在进入实现前至少要有可行的：

- 容器 demux 与精确时间戳；
- 视频和音频 decoder 能力与版本；
- 音频输出和 A/V clock；
- seek、flush、keyframe 恢复和 end-of-stream；
- 帧/音频缓冲上限与背压；
- Worker/WASM/GPU 资源清理；
- 依赖许可、体积、CSP、COOP/COEP 和首包隔离。

交付底线是主要节目可连续播放、文件应有的主音频可用、基础 seek 可验证，并能完整取消和释放资源。rotation、pixel aspect ratio、色彩、HDR、多轨和字幕的已知缺失可以让组合停留在等级 3，后续按价值增强，不要求先升到等级 4 才扩展下一个格式。

只解出第一帧或只展示 metadata 不属于本路线图的视频交付，不能包装成播放器。项目不以 FFmpeg WASM 作为未评审格式的万能 fallback。

## 12. 共享能力策略

当前可以直接复用：

- `viewer-protocol` 的 manifest、probe、open、错误和生命周期；
- `viewer-testing` 的上下文、Abort 和 DOM 所有权测试；
- `viewer-rendering` 的 `ResourceScope`；
- 现有主题变量、内部滚动规范和动态加载门禁。

暂不创建 `MediaDocument`、`MediaPlayer`、`TrackModel` 或统一媒体工具栏。未来独立音频插件成为第二个调用方，并出现状态与生命周期真正相同的重复后，才评估提取小型 media element session；视频专业管线仍保留自己的内容模型。

## 13. 参考资料

- [格式查看器插件协议](../viewer-plugin-protocol.md)
- [查看器插件渲染规范](../viewer-render-tips.md)
- [查看器加载、渲染与部署约定](../viewer-loading-and-deployment.md)
- [WHATWG HTML media elements](https://html.spec.whatwg.org/multipage/media.html)
- [W3C Media Capabilities](https://www.w3.org/TR/media-capabilities/)
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)
