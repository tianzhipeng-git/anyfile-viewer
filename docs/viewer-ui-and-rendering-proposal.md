# 插件通用 UI 与渲染基础设施提案

- 状态：提案
- 范围：`viewer/` 下的查看器插件及其共享依赖
- 目标读者：查看器协议、插件和网站外壳的维护者

## 1. 背景

Anyfile Viewer 计划支持大量文件格式。不同插件虽然负责不同的文件解析逻辑，但会反复遇到相同的界面和渲染问题。

当前表格类插件已经出现以下重复需求：

- 文件名、数据集或工作表选择器。
- 分页、加载、空状态和局部错误。
- 表头、行号、sticky 布局和滚动管理。
- 异步查询竞态、取消和事件清理。

未来使用 Canvas、SVG、WebGL 或 WebGPU 的插件还会重复遇到：

- 根据 `devicePixelRatio` 调整画布，避免高 DPI 屏幕模糊。
- 使用 `ResizeObserver` 响应容器尺寸变化。
- 鼠标滚轮缩放、拖拽平移、触摸 pinch 和键盘操作。
- 屏幕坐标、视口坐标和内容坐标之间的转换。
- fit-width、fit-page、实际大小等视图模式。
- 通过 `requestAnimationFrame` 合并重绘。
- 页面、图层或 tile 的可见性判断和按需渲染。
- Canvas 池、纹理缓存、Object URL 和 GPU 资源释放。
- 中止、销毁和 WebGL context lost 等生命周期处理。

如果每个插件独立实现这些能力，会产生大量重复代码、交互差异和难以覆盖的边界错误。插件作者也会把大部分时间花在浏览器基础设施上，而不是文件格式本身。

## 2. 提案结论

在现有 `viewer-protocol` 和各格式插件之间建立两层共享基础设施：

1. `viewer-ui`：以 Lit 为基础的通用界面组件层。
2. `viewer-rendering`：与格式无关的视口、Canvas、渲染调度和资源生命周期层。

针对场景复杂度，在 `viewer-rendering` 之下选择性接入成熟渲染库。项目不自行重新实现手势兼容、场景图、GPU renderer 或 deep zoom，也不选择一个重量级引擎强制覆盖所有格式。

插件的主要职责应收敛为：

```text
读取与校验文件
      ↓
解析格式专属数据
      ↓
适配为某个共享 UI 或 renderer 可以消费的数据
      ↓
处理格式专属交互与资源
```

## 3. 目标

- 让新插件复用一致的工具栏、状态、控件和交互行为。
- 让 Canvas 类插件复用缩放、平移、尺寸、调度和清理逻辑。
- 减少手工 DOM 更新、事件绑定和异步状态维护。
- 保持插件不依赖 React，也不依赖网站外壳的 React、Tailwind 或 DOM 结构。
- 保持插件级动态加载，避免某个渲染引擎进入所有插件或 `/view` 首包。
- 允许不同格式选择适合自己的渲染技术。
- 建立统一且可独立测试的无障碍、性能和生命周期约定。

## 4. 非目标

- 不修改 `viewer-protocol` 的插件公共接口。
- 部分相似和同构的格式可以抽象中间表示层, 但不要把所有文件格式解析统一为一个万能中间表示
- 不要求所有插件使用 Canvas、WebGL 或同一个图形引擎。
- 不立即引入完整的第三方设计系统。
- 不为了技术统一一次性重写全部现有插件。
- 不把编辑、标注、协作或文件写回纳入当前查看器范围。

## 5. 建议目录结构

```text
viewer/
├── protocol/
│   └── 插件协议、错误类型和协议校验
│
├── ui/
│   ├── components/
│   │   ├── viewer-toolbar
│   │   ├── pagination
│   │   ├── zoom-controls
│   │   ├── empty-state
│   │   ├── loading-state
│   │   └── data-grid
│   ├── styles/
│   └── index.ts
│
├── rendering/
│   ├── canvas-surface
│   ├── viewport-controller
│   ├── zoom-controller
│   ├── render-scheduler
│   ├── visibility-controller
│   ├── page-layout
│   ├── canvas-pool
│   ├── resource-scope
│   └── index.ts
│
├── renderers/
│   ├── canvas-2d/
│   ├── interactive-2d/
│   ├── gpu-2d/
│   ├── deep-zoom/
│   └── three-d/
│
└── plugins/
    └── 各文件格式插件
```

目录名称表达逻辑边界，不要求第一阶段一次性创建所有子包。只有出现真实调用方时才增加具体模块。

## 6. 通用 UI 层

### 6.1 Lit 作为默认实现基础

建议在 `viewer-ui` 中采用 Lit，原因包括：

- Lit 基于原生 Web Components，不会把插件绑定到网站外壳的框架。
- 声明式模板适合条件内容、列表、事件和响应式状态。
- 默认 Shadow DOM 可以隔离插件样式，宿主主题仍可通过 CSS 自定义属性传递。
- 运行时较小，适合插件动态加载模式。
- Lit 的异步任务控制器可以处理 pending、complete、error、竞态和取消状态。

参考资料：

- [Lit 官方网站](https://lit.dev/)
- [Lit standalone templates](https://lit.dev/docs/libraries/standalone-templates/)
- [Lit styles and Shadow DOM](https://lit.dev/docs/components/styles/)
- [Lit async tasks](https://lit.dev/docs/data/task/)

### 6.2 初始组件范围

优先从已经存在两个以上调用方的能力开始：

- 分页数据表格。
- 查看器工具栏。
- 文件名和元数据展示。
- 数据集、工作表或页面选择器。
- 上一页、下一页和页码状态。
- 空状态、局部加载和局部错误。
- 缩放控件和 fit 模式选择。

### 6.3 控件库策略

普通 `button`、`select`、`input` 等优先使用浏览器原生控件，并由 `viewer-ui` 统一样式和行为。

只有当出现 dialog、combobox、menu、tooltip 等无障碍实现复杂的控件时，再评估并按组件粒度引入成熟 Web Component 库。当前不整体引入完整设计系统，避免同时承担第三方视觉语言、主题系统和不必要的 bundle 体积。

## 7. 通用渲染层

### 7.1 `canvas-surface`

负责 Canvas 元素和容器之间的基础关系：

- CSS 尺寸与物理像素尺寸同步。
- `devicePixelRatio` 处理。
- `ResizeObserver` 生命周期。
- Canvas 2D context 初始化和状态重置。
- 挂载、清空和幂等销毁。

### 7.2 `viewport-controller`

维护与具体格式无关的视图状态：

- scale、translation 和可选 rotation。
- 内容坐标与屏幕坐标互转。
- 最小、最大缩放限制。
- fit-width、fit-page 和 actual-size。
- 缩放中心保持。
- 视口边界约束。

### 7.3 `zoom-controller`

统一鼠标、触摸和键盘输入，并将结果写入 `viewport-controller`。建议优先评估 `d3-zoom`，它可以处理鼠标拖动、滚轮、touch、缩放限制和程序化 transform，并且可用于 HTML、SVG 或 Canvas。

参考：[d3-zoom](https://d3js.org/d3-zoom)

### 7.4 `render-scheduler`

- 使用 `requestAnimationFrame` 合并同一帧内的多个状态变化。
- 防止 resize、scroll 和 pointer move 直接触发重复完整渲染。
- 在插件中止或销毁后停止调度。
- 允许插件声明完整重绘和局部重绘。

### 7.5 `visibility-controller` 与 `page-layout`

面向 PDF、演示文稿、多页图片等页面型查看器：

- 计算页面在滚动容器中的位置。
- 只渲染可见页面和适量 overscan。
- 离屏页面降级为占位节点或回收到 Canvas 池。
- 页面尺寸或缩放变化时重新计算布局。

### 7.6 `resource-scope`

统一登记并释放：

- EventListener。
- ResizeObserver 和 IntersectionObserver。
- Worker。
- Object URL。
- Canvas 和 ImageBitmap。
- WebGL/WebGPU texture、buffer 和 renderer。
- 定时器和 animation frame。
- 第三方 renderer 实例。

它不能取代插件协议的 `dispose()`，而是帮助插件可靠实现幂等清理。

## 8. 渲染库选型矩阵

| 场景 | 建议方案 | 说明 |
|---|---|---|
| 普通页面、图片和简单图形 | Canvas 2D + `viewer-rendering` | 不需要额外场景图引擎 |
| Canvas/SVG/HTML 缩放和平移 | `d3-zoom` | 统一鼠标、滚轮和触摸输入 |
| 图元选择、命中检测、图层、标注 | Konva adapter | 提供 Stage、Layer、Shape 和事件系统 |
| 大量图片、精灵或 GPU 2D 场景 | PixiJS adapter | 生产环境优先 WebGL，WebGPU 仍按插件验证 |
| 超高分辨率图片和 tile | OpenSeadragon adapter | 避免自行实现 deep zoom 和 tile 管理 |
| 3D 文件 | Three.js 或领域 renderer | 仅由对应插件动态加载 |
| PDF 页面 | PDF.js + 公共页面/视口层 | PDF.js 负责页面绘制，共享层负责外围体验 |
| 长列表或大型表格 | TanStack Virtual adapter | 只有连续滚动和真实大数据量出现时引入 |

参考资料：

- [Konva](https://konvajs.org/docs/)
- [PixiJS renderers](https://pixijs.com/8.x/guides/components/renderers)
- [OpenSeadragon](https://openseadragon.github.io/)
- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction)

## 9. 不采用万能 Canvas 引擎的原因

不同格式的内容模型差异很大：

- PDF 和多页文档以页面为核心。
- 图片查看器以位图、色彩和缩放为核心。
- PowerPoint 以场景、图层和字体布局为核心。
- CAD 以大量矢量图元和空间索引为核心。
- 3D 格式需要相机、材质、光照和 GPU 管线。
- 超大图片依赖多级 tile，而不是一次加载完整位图。

强行建立统一 scene model 会变成新的复杂协议，并迫使简单插件依赖不需要的能力。本提案只统一所有权、视口、输入、调度和生命周期；内容语义和实际绘制仍由格式插件及其 renderer adapter 决定。

## 10. 依赖与动态加载边界

共享层不能破坏当前插件的延迟加载约定。

```text
打开 CSV
  → Lit + data-grid
  → 不加载 Canvas、Konva、PixiJS

打开普通图片
  → Lit + canvas-surface + zoom-controller
  → 不加载 Konva、PixiJS

打开复杂交互式 2D 文件
  → Lit + viewer-rendering + Konva adapter

打开 GPU 2D 文件
  → Lit + viewer-rendering + PixiJS adapter

打开 3D 文件
  → Lit + viewer-rendering + Three.js 或领域 renderer
```

约束如下：

- `viewer-protocol` 保持零 UI 和零 renderer 依赖。
- `viewer-ui` 可以依赖 Lit，但不能依赖某个格式解析器。
- `viewer-rendering` 只包含轻量且跨格式的基础能力。
- Konva、PixiJS、OpenSeadragon、Three.js 等放在独立 adapter 或具体插件中。
- 重型 adapter 只能从插件实现入口动态加载，不能由 manifest 或网站外壳静态导入。
- 每次新增依赖后运行生产构建和 `/view` 初始 bundle 检查。

## 11. 生命周期边界

共享组件和 renderer 必须服从现有插件协议：

- 只修改插件实例拥有的根节点和后代。
- 不修改 `document.body` 或容器外 DOM。
- 接收并响应宿主传入的 `AbortSignal`。
- `dispose()` 必须幂等。
- 销毁后不再更新 DOM、Canvas 或报告进度。
- 第三方库的 `destroy()`、`close()` 或同类方法必须被调用。
- 任何全局或窗口事件都必须由 `resource-scope` 或等价机制登记和移除。

Lit 的 `disconnectedCallback()` 可以辅助清理组件内部资源，但不能单独取代插件 controller 的显式 `dispose()`。

## 12. 测试策略

### 12.1 `viewer-ui`

- 属性变化会更新对应 DOM。
- 事件只触发一次且可以清理。
- 中英文 copy 和 aria label 正确。
- pending、empty、error 和 ready 状态可测试。
- Shadow DOM 不泄漏样式，主题变量能够传入。

### 12.2 `viewer-rendering`

- 不同 DPR 下物理尺寸正确。
- resize 后重新布局且不会重复注册 observer。
- 坐标转换和 fit 算法使用纯函数单测。
- 高频输入在同一 animation frame 合并。
- Abort 和重复 dispose 后没有继续渲染。
- Canvas、Object URL 和 renderer 资源全部释放。

### 12.3 adapter 与插件

- adapter 使用最小真实场景做集成测试。
- 插件继续执行协议合规测试。
- 对视觉敏感的 renderer 增加固定输入截图或像素级 smoke test。
- 生产构建验证重型依赖没有进入 `/view` 首包或无关插件 chunk。

## 13. 分阶段落地建议

### 阶段一：Lit UI 试点

- 在 `viewer-ui` 引入 Lit。
- 以现有分页数据表格作为第一个组件。
- 保持 Data、SQLite 和 Excel 的外部行为不变。
- 建立 Shadow DOM、主题、异步状态和测试约定。

完成标准：三个表格插件使用同一个 Lit 组件，现有测试和生产 bundle 检查通过。

### 阶段二：Canvas 基础层试点

- 实现 `canvas-surface`、`viewport-controller`、`render-scheduler` 和 `resource-scope`。
- 选择一个简单图片或页面型插件验证 DPR、resize、zoom 和 dispose。
- 评估 `d3-zoom` 是否满足滚轮、拖拽、touch 和宿主滚动冲突要求。

完成标准：试点插件不自行维护 Canvas 尺寸、基础手势和 animation frame 生命周期。

### 阶段三：页面虚拟化

- 为 PDF、PowerPoint 或多页图片引入 `page-layout`、`visibility-controller` 和 Canvas 池。
- 验证快速滚动、大文件和低内存环境。

### 阶段四：按需 renderer adapter

- 只有真实插件需要交互场景图时才增加 Konva adapter。
- 只有真实插件需要 GPU 2D 时才增加 PixiJS adapter。
- 只有真实格式需要 deep zoom 或 3D 时才增加对应 adapter。

每个 adapter 必须至少有两个潜在调用方，或者有一个明确无法通过基础层合理实现的格式需求。

## 14. 风险与应对

### 14.1 公共层过度抽象

风险：在没有实际插件需求时设计大量通用接口，最终不能匹配真实 renderer。

应对：只抽取已重复出现的能力；每个阶段以真实插件试点反推 API。

### 14.2 Shadow DOM 改变测试和样式方式

风险：现有 `querySelector` 测试不能直接穿透 Shadow DOM，第三方内容样式也可能需要 light DOM。

应对：共享控件默认 Shadow DOM；需要第三方 renderer 直接管理内容节点时，由组件提供明确的挂载节点或经过评审采用 light DOM。

### 14.3 重型依赖进入错误 chunk

风险：renderer adapter 被公共入口重新导出后，可能进入无关插件或初始 bundle。

应对：重型 adapter 使用独立 package/export path，并持续运行 bundle marker 和体积检查。

### 14.4 第三方库与插件生命周期不一致

风险：第三方库注册窗口事件、持有 GPU 资源或创建内部滚动层。

应对：每个 adapter 明确所有权和销毁契约，不允许插件直接散落调用重型库 API。

### 14.5 多套 renderer 导致体验分裂

风险：不同引擎的默认缩放、快捷键和工具栏行为不一致。

应对：renderer 只负责绘制；用户可感知的视口命令和 UI 状态统一通过 `viewer-ui` 与 `viewer-rendering` 暴露。

## 15. 待评审问题

1. `viewer-ui` 是否默认使用 Shadow DOM，还是仅叶子控件使用 Shadow DOM？
2. Lit 组件采用自定义元素公开 API，还是先在包内通过 factory 隐藏注册细节？
3. `viewer-rendering` 保持单 package 多 export path，还是按 canvas、viewport、resources 拆成多个 workspace package？
4. 第一款 Canvas 试点插件选择普通图片、PDF 还是 PowerPoint？
5. 缩放手势是否直接采用 `d3-zoom`，还是先用 adapter 隔离后再决定具体实现？
6. 页面虚拟化是否继续使用 DOM 页面占位，还是建立统一 Canvas surface pool？
7. renderer adapter 的引入门槛和 bundle 预算分别是多少？

## 16. 决策原则

后续评审和选型遵循以下顺序：

1. 是否已经有两个以上插件重复实现相同能力？
2. 浏览器原生能力是否足够且易于正确实现？
3. 是否存在成熟、维护良好、可以按需加载的专业库？
4. 第三方库能否服从插件 DOM 所有权、Abort 和 dispose 契约？
5. 是否能避免进入无关插件和初始 bundle？
6. 引入后是否显著减少插件代码和测试负担？

项目应该拥有协议、产品体验和适配边界，不应该重新发明通用 UI 框架、手势系统、场景图、GPU renderer 或 deep-zoom 引擎。
