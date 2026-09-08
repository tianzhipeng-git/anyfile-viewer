# 共享 UI 与渲染架构

本文描述现有共享包及其演进边界。宿主契约见[插件协议](viewer-plugin-protocol.md)，DOM、布局与安全见[渲染规范](viewer-rendering-guidelines.md)，动态加载见[加载部署约定](viewer-loading-and-deployment.md)。

## 1. 共享包职责

| 包 | 当前能力 | 实际调用范围与边界 |
|---|---|---|
| [@anyfile/viewer-ui](../viewer/ui/src/index.ts) | 原生 DOM 分页表格、选择器、空态/局部错误、异步请求竞态与清理 | Data、SQLite、Excel；不是通用组件框架 |
| [@anyfile/viewer-rendering](../viewer/rendering/src/index.ts) | `InteractiveViewport`、`CanvasSurface`、`ResourceScope` | 图片及扁平合成图的视图交互、Canvas 2D 与资源登记；部分全景插件也复用资源登记 |
| [@anyfile/viewer-rendering/audio](../viewer/rendering/src/audio-visualizer.ts) | `AudioVisualizer` | browser-audio、non-native-audio 的画布可视化；不承担解码或统一播放器 UI |
| [@anyfile/rendering-3d](../viewer/rendering-3d/src/index.ts) | Three.js 场景显示、相机/视图控件、按需绘制、对象可见性、动画和资源释放 | CAD 2D、CAD exchange、网格、3D 打印、点云；接收已转换的运行时文档，不解析格式 |
| [@anyfile/rendering-publication](../viewer/rendering-publication/src/index.ts) | 章节窗口、目录/内部链接、阅读样式、安全 iframe 与清理 | EPUB、FB2、MOBI；另有 markup / safe-content 子入口复用章节解析与清理 |

共享包不作为插件注册。解码、文件访问等非 UI 共享能力另由 `runtime-assets`、`ffmpeg-playback`、`raw-decoder` 等包承担，不能因此把整个播放器或文件模型合并。

## 2. UI 与资源所有权

`viewer-ui` 当前无运行时框架依赖，使用原生 DOM 和有作用域的样式。普通控件优先使用原生 `button`、`select`、`input`，不要求所有插件使用相同 DOM 或工具栏。

- 插件 controller 负责整个实例；共享组件只负责约定交给它的节点和资源。
- `ResourceScope` 逆序、幂等执行已登记的清理，不会自动发现 Worker、Object URL、ImageBitmap 或 GPU 对象。
- 第三方 `destroy()` / `close()` / `terminate()` 由插件或共享运行时显式纳入清理。
- 创建失败、取消、重复销毁均须安全，销毁后不得继续画图或更新 DOM。
- 共享包不得反向导入格式插件；主题、locale 和错误所需信息由调用方传入。

## 3. 各渲染模型的边界

### 图片与 Canvas

`InteractiveViewport` 服务单个具有宽高的二维内容平面，提供 fit、actual、缩放、90 度旋转、wheel、单 pointer 拖拽及键盘操作。它也可显示格式插件输出的扁平合成图，但不理解图层、页序列、tile 或 3D camera。

当前没有多 pointer pinch、通用坐标互转或跨格式页面布局 API。`CanvasSurface` 负责 DPR/尺寸同步、边长限制、同帧绘制合并与销毁，不负责图层、命中检测、Canvas 池或 WebGL context 管理。

### 音频可视化

`AudioVisualizer` 只共享 analyser 读数、绘制、循环起停与效果切换。`node` 模式不关闭调用方的 AudioContext，`media` 模式管理自己创建的音频上下文。画布标签和 UI 样式由插件提供；算法与交互契约见 [audio-visualizer.md](../viewer/rendering/audio-visualizer.md)。

音频使用独立 `./audio` 子入口，根入口不得反向引入它，避免图片插件带入音频实现。

### 3D

`rendering-3d` 已经是多个插件使用的共享层。插件把文件转换为 `Rendering3dDocument`，共享层接管场景资源，包括初始化失败时的释放；格式解析、关联资源、单位解释和领域元数据仍归插件。

当前使用 Three.js WebGL renderer 与 OrbitControls，不把领域显示层扩成通用文件模型。支持范围和后续能力分别见 [3D 支持矩阵](3d/support-matrix.md)与[路线图](3d/roadmap.md)，不能以 Three.js 理论能力代替实际格式支持。

### 章节阅读

`rendering-publication` 通过 `PublicationSource` 加载安全章节，管理有界章节窗口和无脚本 iframe。包还提供实际复用的 markup 与内容清理工具；格式解码、容器读取和源数据适配仍由插件负责。

固定页面和漫画的内容模型不同，不强行使用流式章节接口。领域边界见[电子书架构](ebooks/architecture.md)。

## 4. 演进原则

先处理真实调用方的重复或维护问题，再建立最小共享接口。至少两个稳定调用方通常是提取共享层的依据；单一格式有明确复杂领域需求时，可以使用专用库，不必先包装成“通用 adapter”。

- 原生 DOM 出现可验证的复杂嵌套状态或增量更新问题时，再比较局部修正与 Lit。Lit、Web Components 和 Shadow DOM 分别决策，不触发全站迁移。
- 图片以外的格式若有共同坐标与输入语义，先定义内容模型、坐标空间、缩放锚点、滚动和边界，再决定是否共用 viewport。
- 触屏 pinch 纳入需求后再实现或选择手势库，并验证多 pointer、取消、缩放中心和页面滚动冲突。
- 两个页面型插件出现相同可见性与回收需求后，再提取页面虚拟化；现有 PDF 调度可继续保持专用。
- 场景图、GPU 2D 或 deep zoom 的新依赖由实际格式需求与测量触发，不预建万能 scene model 或 renderer adapter。

音视频保留各自 manifest、probe、UI 和支持矩阵；可复用底层解码运行时。已采用的 FFmpeg 共享边界见[音视频播放架构](videos/ffmpeg-playback-runtime-plan.md)。未来规划不能写成已实现能力。

## 5. 加载与验证

共享 UI 和 renderer 只随实际引用的插件动态加载，不进入宿主、manifest 或 probe。重型领域库使用独立包或子入口，不能从基础入口无条件导出。

修改共享层时验证所有实际调用方，并按改动覆盖：

- 表格：异步竞态、取消、empty/error/ready、分页、键盘与重复销毁。
- 图片/Canvas：缩放与旋转、resize/DPR、帧合并、尺寸上限和事件释放。
- 音频：上下文所有权、循环与 reduced-motion、效果切换及销毁后停画。
- 3D：几何预算、相机与对象交互、context lost/restored、场景和 GPU 释放。
- 章节阅读：章节窗口、内部链接、内容安全、快速切换和 iframe 生命周期。

单元测试验证局部行为；布局、GPU 和媒体行为需真实浏览器验收。新增依赖或加载入口还须通过生产 bundle 检查。
