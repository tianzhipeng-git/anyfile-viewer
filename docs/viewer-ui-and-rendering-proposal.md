# 共享 UI 与渲染基础设施决策记录

- 状态：记录当前实现、已确认决策和后续触发条件；不是待按阶段照搬的架构蓝图
- 范围：`viewer/` 下的查看器插件及其共享依赖
- 目标读者：查看器协议、插件和网站外壳的维护者
- 实现依据：以仓库代码、[插件协议](viewer-plugin-protocol.md)、[渲染规范](viewer-render-tips.md)和[加载部署约定](viewer-loading-and-deployment.md)为准

每次修改本记录时都要先核对实际调用方。规划能力不得写成当前能力，试点抽象不得写成格式无关基础层，技术候选不得写成默认依赖。

## 1. 决策摘要

### 1.1 `viewer-ui` 当前保持原生 DOM

`@anyfile/viewer-ui` 当前提供原生 DOM 实现的分页表格 UI，统一处理表格 DOM、选择器、分页、空态、局部错误、样式、异步查询竞态和事件清理。Data、SQLite 和 Excel 插件是它的实际调用方。

当前没有 Lit 运行时依赖，也没有 Web Components 或 Shadow DOM。Lit 不是默认方向，只在原生 DOM 已出现可验证的复杂度问题时，针对具体组件重新评估。评估结论可以是继续使用原生 DOM。

### 1.2 `viewer-rendering` 以图片试点为主，另有音频可视化子入口

`@anyfile/viewer-rendering` 当前导出：

- `InteractiveViewport`：面向单张图片的 fit、actual size、缩放、旋转和平移交互；
- `CanvasSurface`：Canvas 2D 的 DPR 尺寸同步、`ResizeObserver`、逐帧合并绘制和销毁；
- `ResourceScope`：清理函数与事件监听器的集中登记和幂等释放；
- `ViewTransform`、`ViewMode` 和 `ViewportControls` 等配套类型；
- `AudioVisualizer`（子入口 `@anyfile/viewer-rendering/audio`）：在调用方拥有的 `<canvas>` 上绘制随音频跳动的曲线，复用 `CanvasSurface` 与 `ResourceScope`，由 `browser-audio` 与 `non-native-audio` 共同调用。用户点击该 canvas（或它获得焦点后按 Enter/Space）即可循环切换效果。绘制算法、切换交互与改动范围见 `viewer/rendering/audio-visualizer.md`。

这些代码来自图片插件的真实重复，但这不等于格式无关的通用渲染层已经完成。`InteractiveViewport` 的构造参数和行为直接包含图片宽高、90 度旋转、fit/actual 按钮以及单内容平面语义，应标记为“被多款图片复用的图片试点”。

`AudioVisualizer` 是共享层第一次超出图片范围，因此单独走 `./audio` 子入口，而不是从根入口重新导出。这样图片插件的 chunk 不会因为根入口而把音频代码纳入模块图；`viewer/rendering/src/index.ts` 也不得反向 import 该模块。它只共享渲染与效果切换交互（DPR、循环起停、analyser 读数、主题色、画布激活循环模式、幂等销毁），音频图所有权仍留在插件：`node` 模式只挂旁路且不关闭调用方的 AudioContext，`media` 模式才自建并自关。这不是 `docs/audio/architecture.md` 禁止的公共 `MediaPlayer` 或统一媒体工具栏。

### 1.3 继续按真实重复提取，不预建万能层

共享层只吸收已有调用方验证过的重复。PDF 页面、演示文稿、超大图片、图层文档、CAD 和 3D 的内容模型不同；在它们出现共同且稳定的需求前，不建立统一 scene model、通用 renderer adapter 或通用坐标协议。

`viewer-protocol` 继续保持零 UI、零 renderer 依赖。插件可以选择原生 DOM、Lit、Canvas、WebGL/WebGPU 或领域 renderer，但选择不进入公共协议。

## 2. 当前能力矩阵

| 能力 | 状态 | 当前实现或证据 | 明确边界 |
|---|---|---|---|
| 分页表格 UI | 已落地 | `viewer/ui` 的 `createPagedTableViewer`；Data、SQLite、Excel 复用 | 原生 DOM；只覆盖分页表格，不是通用组件库 |
| 异步表格状态与清理 | 已落地 | 请求序号抑制过期结果，处理 empty/error，`dispose()` 移除监听和根节点 | 没有通用异步任务控制器 |
| Lit | 未落地 | 无运行时依赖、无 Lit 组件 | 触发式评估，不是默认迁移目标 |
| Web Components / Shadow DOM | 未落地 | 当前 UI 使用 light DOM 和带前缀的作用域样式 | 是否采用必须随具体组件单独决策 |
| 图片 viewport | 图片试点已落地 | `InteractiveViewport` 被浏览器图片、通用栅格、现代栅格和相机 RAW 插件复用 | 图片尺寸和控件耦合；不宣称适用于页面、图层、tile、3D 或任意内容 |
| wheel / 单指针拖拽 / 键盘操作 | 图片试点已落地 | `InteractiveViewport` 自行监听 wheel、pointer 和 keydown | 没有跨浏览器手势库，也没有多指手势 |
| pinch 缩放 | 未落地 | 没有多 pointer 状态或 touch pinch 算法 | 不得由 `touch-action: none` 推断为已支持 |
| 图片 fit / actual / 旋转 | 图片试点已落地 | 单图片尺寸、中心点、缩放比例和 90 度旋转 | 不是通用 fit-width、fit-page 或任意旋转模型 |
| 通用坐标系统 | 未落地 | 只有图片绘制使用的 `scale`、`rotation`、`panX`、`panY` | 没有公开的屏幕、视口、内容坐标互转 API，也没有边界约束协议 |
| Canvas 2D surface | 图片试点已落地 | `CanvasSurface` 被通用栅格、现代栅格和相机 RAW 插件复用 | 不管理图层、命中检测、Canvas 池、WebGL/WebGPU 或 context lost |
| 音频可视化曲线 | 已落地 | `AudioVisualizer`（`viewer-rendering/audio`）被 `browser-audio` 与 `non-native-audio` 复用；点击画布或 Enter/Space 循环切换 spectrum/waveform | 只管渲染与切换行为；不拥有插件的 AudioContext（`media` 模式除外）、不解码 PCM、不做整轨波形、不是统一媒体工具栏；只在自己那个 canvas 上挂监听，`role`/`tabindex`/`aria-label`/`title` 与 CSS 仍归插件 |
| 绘制调度 | 局部落地 | `CanvasSurface.schedule()` 用 `requestAnimationFrame` 合并重绘 | 不是独立、通用的 render scheduler；没有局部失效模型 |
| 资源登记 | 基础能力已落地 | `ResourceScope` 支持清理函数、事件监听和幂等逆序释放 | Worker、Object URL、ImageBitmap、GPU 等仍由调用方显式登记或自行管理 |
| 页面布局与虚拟化 | 未形成共享层 | PDF 等插件有各自的可见性和页面渲染逻辑 | 没有公共 `page-layout`、`visibility-controller` 或 Canvas 池 |
| renderer adapter | 未落地 | 没有 Konva、PixiJS、OpenSeadragon、Three.js 或 TanStack Virtual adapter | 只有真实格式需求达到门槛后才评估 |

## 3. 当前架构与加载边界

当前实际关系是：

```text
Data / SQLite / Excel
  → @anyfile/viewer-ui
  → 原生 DOM 分页表格

浏览器图片
  → 插件自己的原生 DOM 工具栏和 <img>
  → InteractiveViewport

通用栅格 / 现代栅格 / 相机 RAW
  → 插件自己的原生 DOM 工具栏和 decoder
  → InteractiveViewport + CanvasSurface

浏览器音频 / 非原生音频
  → 插件自己的原生 DOM、<audio> 或 AudioContext 播放图
  → @anyfile/viewer-rendering/audio 的 AudioVisualizer
  → CanvasSurface + ResourceScope

所有其他插件
  → 各自的 DOM、渲染器和生命周期实现
  → 不因共享包存在而自动依赖 viewer-ui 或 viewer-rendering
```

加载边界继续遵守插件级动态加载：

- 网站外壳只静态加载纯数据 manifest；probe 和完整插件按需动态加载。
- `viewer-ui` 和 `viewer-rendering` 只能随实际引用它们的插件进入对应 chunk，不能由网站外壳或 manifest 静态导入。
- 重型渲染器只能位于具体插件或未来独立 adapter 的动态入口，不能从公共入口无条件重新导出。
- 新增依赖后运行生产构建和 `/view` 首包检查，不能通过提高体积上限掩盖边界错误。

Lit 当前不在加载图中。只有未来某个具体组件通过引入评审后，该组件的插件 chunk 才可以包含 Lit；这不改变其他插件，也不改变协议。

## 4. 已确认的设计边界

### 4.1 UI 边界

- 普通 `button`、`select`、`input` 优先使用浏览器原生控件。
- 共享 UI 必须保持插件 DOM 所有权、主题变量、无障碍和幂等清理约束。
- 不建立统一网站工具栏协议，也不要求所有插件呈现同一 DOM 结构。
- 只有出现两个以上真实调用方，或一个复杂组件已明确无法由局部实现合理维护时，才增加共享组件。

### 4.2 图片 viewport 边界

`InteractiveViewport` 当前可以继续服务图片插件，但新增调用方必须先判断自己的语义是否确实是“单个有宽高的二维图片”。如果需要页面滚动、多个内容节点、tile、图层、命中检测、非图片坐标或 3D camera，不应把这些能力继续塞入该类。

未来若出现跨格式的稳定共同模型，应新建设计并明确迁移关系，而不是仅通过重命名把当前图片 API 宣称为通用 API。

### 4.3 生命周期边界

- 共享类不能取代插件协议的 `dispose()`；插件 controller 仍负责完整资源所有权。
- `ResourceScope` 只释放已登记的资源，不自动发现 Worker、Object URL、ImageBitmap 或 GPU 对象。
- 销毁后不得继续更新 DOM、Canvas 或报告进度。
- 第三方库的 `destroy()`、`close()`、`terminate()` 等必须由插件或 adapter 显式纳入清理。

## 5. 后续决策触发条件

以下项目没有默认实施顺序。只有触发条件满足后，才为具体问题建立设计和验收标准。

### 5.1 Lit

触发条件：某个共享组件已经出现复杂嵌套状态、大量增量 DOM 更新或重复的声明式渲染需求，并且现有原生 DOM 实现产生了可展示的维护或正确性问题。

评估时至少比较：

- 继续使用原生 DOM 的最小修正；
- Lit 对代码量、状态正确性和测试的实际改善；
- 运行时和插件 chunk 体积；
- light DOM 与 Shadow DOM 对主题、第三方 renderer 和现有测试的影响；
- 是否只在单个组件中使用，而不是把 Lit 变成整个 `viewer-ui` 的强制基础。

Lit 与 Shadow DOM 是两个独立决策。采用 Lit 不自动采用 Shadow DOM，采用某个 Lit 组件也不触发其他组件迁移。

### 5.2 通用 viewport 或坐标系统

触发条件：至少一个非图片查看器与图片插件出现相同且稳定的坐标转换、视图状态或输入语义，并且复用能减少而不是增加格式分支。

设计前必须先写清：内容模型、坐标空间、缩放锚点、边界约束、旋转单位、滚动关系和可访问输入。当前 `InteractiveViewport` 只能作为图片行为证据，不能直接作为通用接口答案。

### 5.3 pinch 与手势库

触发条件：明确把触屏图片交互纳入产品验收，并具备真实触屏浏览器测试条件。

实现必须覆盖多 pointer 跟踪、缩放中心保持、pointer cancel、浏览器滚动冲突和销毁。届时比较最小原生实现与 `d3-zoom` 等成熟库；当前不预先承诺具体库。

### 5.4 页面虚拟化

触发条件：页面型插件出现可复现的首屏、快速滚动或内存问题，并且至少两个调用方共享页面占位、可见性和回收语义。

在此之前，PDF 等插件的页面调度保持插件内部实现，不把已有专用逻辑包装成尚无共同契约的公共层。

### 5.5 renderer adapter

只有具体格式明确需要以下能力时才评估对应库：

| 需求 | 可评估候选 | 当前决定 |
|---|---|---|
| 场景图、图元事件、命中检测 | Konva | 不引入 |
| 大量 GPU 2D 图元 | PixiJS | 不引入 |
| 超高分辨率 tile / deep zoom | OpenSeadragon | 不引入 |
| 3D 内容 | Three.js 或领域 renderer | 留在具体插件，除非出现稳定共享边界 |
| 大型虚拟列表 | TanStack Virtual | 先由真实数据量和性能问题触发 |

adapter 原则上需要两个潜在调用方；单一格式若有明确且无法由轻量基础合理实现的领域需求，可以例外，但 adapter 仍不得进入无关插件 chunk。

CAD、通用网格、CG、3D 打印与点云的长期目标已经形成独立的[3D 文件查看架构](3d/architecture.md)和[实施路线图](3d/roadmap.md)，规划以 DXF 线框与 STL 网格两个真实调用方建立 `@anyfile/rendering-3d`。共享 `@anyfile/rendering-3d` 已由 DXF、网格、打印与点云插件实际调用；精确范围和未完成项仍以[3D 支持矩阵](3d/support-matrix.md)为准。

## 6. 测试现状与新增要求

### 6.1 当前测试覆盖

- `viewer-ui` 测试分页、选择、表格渲染、局部错误和重复 dispose。
- `viewer-rendering` 测试基本 transform 更新、交互监听清理以及 `ResourceScope` 的逆序幂等释放。

这些测试证明当前实现的局部行为，不证明 Shadow DOM、pinch、通用坐标转换、页面虚拟化或 renderer adapter 已存在。

### 6.2 修改现有能力时

- `viewer-ui`：验证异步竞态、Abort、empty/error/ready、键盘与 aria、事件只触发一次以及重复 dispose。
- `InteractiveViewport`：验证 wheel、单 pointer、键盘、fit/actual、旋转、resize、监听清理和图片调用方回归。
- `CanvasSurface`：验证 DPR、最大边长限制、resize、同帧合并、取消 frame、Canvas 释放和重复 dispose。
- `AudioVisualizer`：验证 `node`/`media` 两种 tap 的接入与所有权边界、循环起停、reduced-motion 静止态、DPR、dispose 后停画，以及画布点击与 Enter/Space 循环切换（切换后重设 `smoothingTimeConstant`、只补一帧、不重启已有循环、dispose 后监听失效）。
- `ResourceScope`：验证登记后立即释放、逆序释放、重复 dispose 以及各类实际资源的适配用法。
- 生产构建：验证共享依赖只进入实际调用插件的 chunk。

如果新增 pinch、坐标转换、页面虚拟化或 adapter，必须同时新增对应测试，不能把它们写进能力矩阵后留待以后补测。

## 7. 决策原则

后续评审按以下顺序判断：

1. 问题是否已在真实插件中出现，而不是由候选技术反推需求？
2. 是否已有两个以上实现重复，或单一领域需求明确无法局部解决？
3. 浏览器原生能力和更小的局部实现是否足够？
4. 公共接口能否不包含格式分支，并减少调用方代码和测试负担？
5. 第三方依赖能否服从 DOM 所有权、Abort、dispose、CSP 和动态加载边界？
6. 是否有测试和生产 bundle 证据支持“已落地”的状态？

项目应拥有协议、产品体验和资源边界，但不预先拥有一个尚未被调用方证明的通用 UI 框架、手势系统、scene model、GPU renderer 或 deep-zoom 层。
