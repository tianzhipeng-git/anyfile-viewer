# 3D 文件查看架构

> 实施状态见 [implementation-status.md](implementation-status.md)；本文保留目标设计，不能把全部条目视为已完成。
- 状态：共享 3D runtime 与首批格式已实施；完整范围仍在推进
- 适用范围：CAD、3D 打印、CG 场景、通用网格与点云文件的浏览器本地只读查看
- 不包含：编辑、建模、切片、格式转换、服务端转换、渲染农场和任意远程资产加载
- 相关文档：[支持矩阵](support-matrix.md)、[实施路线图](roadmap.md)、[共享 UI 与渲染基础设施决策](../viewer-ui-and-rendering-proposal.md)

## 1. 目标与原则

3D 架构需要同时满足：

- 用户文件只在浏览器本地读取、解析和渲染；
- 优先扩大真实可查看的格式覆盖，不以完整编辑器或专业 CAD 内核为首期目标；
- 线、点、三角网格、材质、层级、CAD 图层与打印构件可以按领域逐步交付；
- 大型 parser、Three.js、Worker、WASM 和格式 loader 只在对应插件被选中后加载；
- 大文件、压缩包、纹理、点云和 CAD tessellation 具有可度量的资源上限；
- 格式解析、领域语义、场景显示和网站协议保持清晰边界；
- abort、dispose、DOM 所有权、错误码和支持等级继续遵守查看器插件协议。

“可以旋转一个模型”只证明具备三维观察能力，不等于完整支持该格式。每个格式仍需按几何、层级、材质、动画、单位、关联资源和领域语义分别验收。

## 2. 技术决策

### 2.1 采用 Three.js 作为共享显示引擎

规划新增 `@anyfile/rendering-3d` workspace 包，使用锁定精确版本的 Three.js 提供共享 3D 显示基础设施。

名称使用 `rendering-3d` 而不是 `viewer-3d`，因为它不是可注册的 `FileViewerPlugin`：它没有 Manifest、probe 或独立 `open()`，也不负责判断和读取某种文件。它只被具体格式插件按需调用。

Three.js 负责：

- WebGL renderer、scene、camera 和 render loop；
- 正交/透视投影、orbit、pan、zoom、fit 和标准视图；
- 线、点、三角网格、材质、纹理和基础 animation mixer；
- viewport resize、DPR、context lost 和 GPU 资源释放；
- scene object 的显示/隐藏、选择高亮和可见性更新；
- 统一的渲染统计与资源预算执行点。

Three.js 不负责：

- 文件扩展名路由和有界 probe；
- DXF、STEP、3MF、LAS 等格式合法性校验；
- CAD B-Rep、图层、装配、单位或打印语义；
- 工作区关联文件授权；
- 把网络 URL 转换成本地资产；
- Viewer Protocol 的生命周期和错误展示。

不自行维护另一套通用 WebGL 引擎。已有全景插件的专用 shader 继续留在其领域实现中，不为了统一而迁移到 Three.js。

### 2.2 WebGL 是首个生产后端

首期使用 Three.js WebGL renderer。WebGPU 不作为首期前置条件，也不同时维护 WebGL/WebGPU 两套行为。只有出现 WebGL 无法满足的已测量模型规模或明确渲染能力后，才评估 WebGPU renderer，并保留目标浏览器可用的回退路径。

### 2.3 不建立万能文件模型

CAD、CG、打印和点云不会被压成一个包含大量可选字段的公共协议。共享层只接受已经可渲染的运行时文档；领域数据由插件保留。

规划中的窄运行时契约可表达为：

```ts
interface Rendering3dDocument {
  readonly root: THREE.Object3D
  readonly bounds?: THREE.Box3
  readonly preferredProjection?: "orthographic" | "perspective"
  readonly views?: readonly Rendering3dViewPreset[]
  readonly tree?: readonly Rendering3dTreeNode[]
  dispose(): void
}
```

该契约属于 `@anyfile/rendering-3d`，不进入 `@anyfile/viewer-protocol`，也不是 Worker 消息格式或持久化格式。具体插件可以在它之外维护：

- CAD：图层、单位、装配、原始实体与 B-Rep 句柄；
- CG：节点、材质、纹理、动画和文件内相机；
- 3D 打印：构件、单位、包围尺寸和构建板信息；
- 点云：分块索引、LOD、分类与标量属性。

Worker 输出使用格式专属、可转移的 `ArrayBuffer`/TypedArray 消息，主线程 adapter 再建立 Three.js 对象。不得把 `THREE.Object3D` 当成 Worker 或插件公共协议的数据模型。

## 3. 包与插件边界

### 3.1 共享包

```text
viewer/rendering-3d/
├── src/runtime/          renderer、camera、frame scheduling
├── src/interaction/      orbit、pan、zoom、标准视图
├── src/resources/        geometry/material/texture/GPU 清理
├── src/scene/            bounds、fit、tree visibility、selection
├── src/ui/               可复用的最小 3D toolbar/viewport DOM
└── src/index.ts          窄公共入口
```

首期只暴露已经被至少 DXF 线框和 STL 网格共同验证的能力。格式 loader、CAD tessellator、点云索引器和完整插件 UI 不进入根入口。

公共包可以使用子入口隔离非通用能力，但不得从根入口重新导出导致所有 3D 插件一起打包。例如 animation、measurement 或特定 loader 只有出现真实调用方后再增加独立子入口。

### 3.2 建议插件族

| 插件族 | 目标范围 | 领域责任 |
|---|---|---|
| CAD | DXF；后续 STEP、IGES、BREP | 图层、工程视图、单位、装配与 tessellation |
| mesh / CG | STL、OBJ、PLY、OFF、glTF/GLB；后续 FBX、DAE、3DS | 网格、层级、材质、纹理、相机与动画 |
| additive manufacturing | 3MF、AMF；必要时与 STL 候选竞争 | 构件、打印单位、尺寸与构建信息 |
| point cloud | PCD、LAS/LAZ、E57、XYZ | 分块、LOD、点属性与点预算 |
| USD | USD/USDZ 在具备受维护的 USD 解析路径后独立评估 | USD composition、引用、schema 与资产解析 |

这些是依赖和领域边界，不要求一个插件一次声明整个族。一个领域插件支持多个扩展名时，格式 adapter 仍应在 `open()` 内二次动态加载，避免打开 STL 时同时加载 glTF、FBX 或 CAD 代码。

同一扩展名可以由多个插件竞争。例如 STL 可以由通用 mesh 插件提供几何查看，也可以由打印领域插件在交付额外打印语义后返回更高支持等级。不能仅因工具栏更多就提高等级。

## 4. 数据路径

### 4.1 普通网格与场景

```text
File / WorkspaceReader
        │
        ▼
有界格式校验
        │
        ▼
格式 parser 或 Worker
├── 顶点、索引、法线、颜色
├── 节点、材质、纹理引用
└── 单位、坐标轴、相机、动画 metadata
        │ Transferable
        ▼
格式 adapter
        │
        ▼
Rendering3dDocument
        │
        ▼
@anyfile/rendering-3d
```

GLB、二进制 STL 等单文件路径可以在明确上限内一次读取；大型文本 OBJ/PLY、点云和带大量资源的场景优先流式或分块解析。第三方 loader 如果只能整体读取，必须根据实测峰值内存设置输入上限，不能隐藏该限制。

### 4.2 精确 CAD

```text
STEP / IGES / BREP File
        │
        ▼
CAD Worker + WASM kernel
├── 校验与拓扑解析
├── 装配/名称/颜色/单位
├── B-Rep 保留在 Worker 或领域文档
└── 按容差 tessellation
        │ positions/indices/edges + metadata
        ▼
主线程 CAD adapter
        │
        ▼
Three.js mesh / line objects
```

Three.js 显示的是 tessellation 结果，不替代精确 CAD kernel。曲面容差、边线生成、装配实例化和峰值内存必须由 CAD 插件记录。OpenCascade 或其他 C/C++/Rust 内核如果需要项目自行构建，必须遵守源码构建型第三方依赖规范。

### 4.3 点云

点云不能默认把所有点一次转换为一个常驻 `BufferGeometry`。点云插件负责索引和 LOD，按相机与点预算向共享渲染层提交当前可见块；共享层只管理当前 GPU buffer 和绘制。

## 5. 坐标、单位与相机

必须区分以下空间：

```text
文件原始坐标
  ↓ 格式 adapter
领域模型坐标（保留单位、up axis、手性和原点）
  ↓ root transform / origin rebasing
Three.js 世界坐标
  ↓ camera view + projection
屏幕坐标
```

规则：

- 不为 fit 永久改写原始单位；模型居中和显示缩放优先放在根 transform；
- GPU 使用局部坐标时保留原始 origin/units metadata，避免测量和属性显示失真；
- CAD 和打印默认正交相机，CG 场景默认透视相机，用户可切换时必须保留当前观察目标；
- 顶、前、右、等轴测基于领域坐标轴，不是屏幕平面旋转；
- 文件内相机或 DXF named view 作为可选 preset，不覆盖用户当前视图；
- 极大世界坐标使用 origin rebasing，避免 Float32 GPU 精度抖动；
- 空场景、单点、共线和二维共面场景必须有稳定的 bounds/fit 行为。

DXF 检测到有效 Z 跨度时进入三维线框模式；所有几何共面时默认保持二维工程图体验，但仍复用同一 3D runtime 的正交相机和线渲染路径。首期迁移必须验证二维 DXF 不因引擎更换发生方向、颜色或 fit 回归。

## 6. 共同交互与领域 UI

共享 runtime 的首批共同交互：

- orbit、pan、wheel zoom、fit 和 reset；
- 顶视、前视、右视、等轴测；
- 正交/透视投影切换；
- 网格、坐标轴、线框/实体显示；
- scene tree 节点显示/隐藏；
- 基础选中高亮与属性回调；
- 键盘可操作的等价控件和可读状态。

以下 UI 留在领域插件：

- CAD 图层、装配树、工程视图、单位和 tessellation 精度；
- CG 材质、纹理、动画列表和文件相机；
- 打印构件、真实尺寸、构建板和网格诊断；
- 点云分类、标量着色、点大小和 LOD 状态。

首期不交付测量、剖切、爆炸视图、编辑、修复或切片。只有用户价值和格式证据明确后再增加，并避免把领域操作塞进共享 toolbar。

## 7. 资源与性能边界

每个格式必须按真实分配模型记录并执行至少以下预算：

- 输入文件与累计关联文件字节数；
- 压缩容器条目数、展开总量、路径深度和压缩比；
- 节点、图元、顶点、索引、三角形、线段和点数量；
- 单纹理尺寸、总纹理像素、解码后纹理字节和 mipmap 成本；
- Worker/WASM memory、tessellation 输出和主线程复制次数；
- 常驻 GPU buffer、draw call、材质和纹理数量；
- 首屏时间、峰值内存和持续交互帧率。

基础策略：

- parser、解压和 CAD tessellation 优先在可终止 Worker 中执行；
- Worker 结果通过 Transferable 移交，避免大型 TypedArray 复制；
- 重复网格使用 instancing，静态小对象按证据合并 draw call；
- 大模型分批建立 GPU 资源，先展示可理解的内部加载状态；
- 点云、超大 mesh 和多 LOD 格式按视锥与屏幕误差加载；
- render loop 只在交互、动画或资源更新时持续运行，静止场景按需重绘；
- 达到边界返回 `resource-limit`，不能依赖浏览器 OOM 作为限制机制。

具体数值不在架构阶段拍脑袋统一规定。阶段 0 用固定样例测量后，按格式族记录在支持矩阵或实现文档中。

## 8. 关联资源、安全与隐私

OBJ/MTL、glTF、USD 和其他场景格式可能引用纹理、buffer 或子场景。处理规则：

- 只通过当前 `file` 与 `context.workspace` 读取关联文件；
- 规范化相对路径并拒绝绝对路径、目录逃逸和危险 scheme；
- 默认不请求文件内的 `http:`、`https:`、`data:text/html` 或任意自定义 URL；
- 允许规范明确、经过大小检查的嵌入式 `data:` buffer/image，但不能执行脚本或 HTML；
- Blob/Object URL 由当前插件实例持有并在 dispose 中撤销；
- 文件名、路径、模型、纹理、截图和解析结果不上传；
- shader、material、node name 和 metadata 都作为数据处理，不能生成可执行代码或未清洗 HTML；
- 压缩容器和图片解码分别执行条目、展开量、像素和内存上限。

Three.js loader 的默认 URL 行为不能绕过这些规则。需要使用受控的 resource resolver，把合法相对引用映射到 `WorkspaceReader` 返回的 File/Blob，而不是让 loader 直接访问网络。

## 9. 生命周期与失败语义

插件拥有完整生命周期，`@anyfile/rendering-3d` 只释放自己被交付的资源：

1. abort parser/Worker/WASM；
2. 停止 render loop、animation mixer 和延迟回调；
3. 移除 input、resize 和 context 事件；
4. 释放 render target、geometry、material、texture 和 renderer；
5. 撤销插件创建的 Object URL；
6. 移除当前插件根节点。

插件返回的 controller 必须把领域资源和 runtime 的 `dispose()` 组合成幂等清理。context lost、纹理解码或局部节点失败在插件 active 阶段显示局部/整体错误，不在 `open()` resolve 后继续调用宿主 `reportProgress()`。

错误映射：

- 格式损坏、越界引用和不合法结构：`invalid-file`；
- 缺少必要关联 buffer/texture：`missing-related-file`；
- WebGL、必要 decoder 或 WASM 不可用：`unsupported-environment`；
- 输入、展开、几何、纹理、GPU 或内存超限：`resource-limit`；
- 无法归类的初始化失败：`open-failed`。

## 10. 加载与部署边界

- 网站壳只静态导入纯数据 Manifest；
- probe 只读取识别格式和真实支持等级所需的有界字节，不加载 Three.js、完整 parser、Worker 或 WASM；
- `@anyfile/rendering-3d` 只随选中的完整 3D 插件动态加载；
- 同一领域插件的不同格式 loader 继续使用内部 `import()` 拆分；
- CAD/点云 WASM、Draco、Meshopt、KTX2 等可选 runtime 只在文件实际需要时加载；
- 依赖使用精确版本，许可证和运行资产可审计；
- 达到 2 MiB 单资源或 4 MiB 典型冷启动门槛的资产按加载部署约定接入外部资产链路；
- 生产构建门禁检查 Three.js 和各类 loader 不进入 `/view` 初始 JavaScript，也不进入非 3D 插件。

当前 OCCT `0.0.23-anyfile.1` 使用 `R2 → 同源`，LAZ 小型运行时保持同源。OCCT 只对初始化失败回退，每次重建并清理 Worker；用户文件在初始化成功后才 transfer，解析错误不重试。精确路径、体积和发布验证见 [依赖审计](dependency-audit.md)。

是否共享 bundler 生成的 Three.js chunk 以生产构建结果为准，不能通过静态导入网站壳强制共享。

## 11. 支持等级与验收

3D 文件的支持单位不是扩展名，而是：

```text
格式/版本/编码
  × 几何 primitive 与拓扑
  × 层级、实例、材质、纹理、动画
  × 单位、坐标轴、相机和领域 metadata
  × 外部/嵌入资源组织
  × 规模和目标浏览器环境
```

一般建议：

- 等级 1：仅可靠结构或 metadata 检查；
- 等级 2：缩略图、代表性对象或明显不完整的扁平结果；
- 等级 3：主要几何可交互查看，但缺少有意义的格式语义；
- 等级 4：声明范围内的主要几何、常见材质/层级/单位等完整可用；
- 等级 5：在等级 4 基础上交付 CAD、打印、CG 或点云的领域导航与理解能力。

可旋转、按钮多或使用 GPU 不自动提高等级。只有线框可见但丢失实体面的 CAD 文件不能标为完整查看；glTF 动画文件如果只显示静态姿势，需要在组合记录中降级并声明限制。

每个交付组合至少验证：

- 固定真实/可再分发样例、损坏、截断、伪装和超限样例；
- 初始可见、orbit、pan、zoom、fit、resize 和投影切换；
- 坐标方向、单位、bounds、法线、索引和材质结果；
- 关联文件缺失、非法路径、远程 URL 和压缩炸弹；
- opening abort、active abort、连续切换和重复 dispose；
- Worker、WASM、Object URL、GPU、事件和 frame loop 无残留；
- 目标浏览器真实 WebGL smoke；mock WebGL 单元测试不能冒充真实渲染证据；
- `pnpm test`、`pnpm lint`、`pnpm build` 和首包门禁通过。

## 12. 当前明确不做

- 在 Viewer Protocol 中加入 Three.js 或 3D scene 类型；
- 把所有 3D 格式注册到一个无边界的万能插件；
- 为统一而让浏览器原生预览路径经过 Three.js；
- 服务端上传、转换或生成预览图；
- 从模型文件自动访问任意网络资源；
- 在应用构建时在线编译 CAD kernel；
- 在没有真实格式样例和资源测量前宣称完整支持；
- 首期实现编辑、保存、修复、切片或专业 CAD 操作。
