# 3D 文件查看支持矩阵

- 状态：当前能力与规划候选的事实记录
- 口径：`implemented` 表示代码路径存在，`verified` 表示已有固定样例和自动/真实环境证据；规划目标不等于当前支持
- 相关文档：[3D 文件查看架构](architecture.md)、[实施路线图](roadmap.md)

## 1. 当前已实现能力

完整范围、限制、预算和证据见 [实施记录](implementation-status.md)，依赖判断见 [依赖审核](dependency-audit.md)。

| 格式 | 插件 | 当前能力 | 等级 | 验证状态 |
|---|---|---|---:|---|
| ASCII DXF | cad-2d（保留唯一已有 ID） | XYZ 几何、标准视图、orbit、图层显隐 | 3 | implemented；bridge.dxf 真实 Chrome smoke 通过，完整矩阵待补 |
| ASCII/binary STL | mesh-3d | 三角网格、尺寸、线框、可取消 Worker | 3 | implemented；固定样例与 Chrome smoke 通过 |
| OBJ/MTL | mesh-3d | 网格、对象、本地材质与简单漫反射纹理 | 3 | implemented；几何 smoke 通过，关联材质矩阵待补 |
| PLY / OFF | mesh-3d | 网格/点（PLY）、基础凸多边形（OFF） | 3 | implemented；固定样例 smoke 通过，binary PLY 证据待补 |
| glTF / GLB | mesh-3d | glTF 2.0 场景、材质与动画入口 | 3 | implemented；GLB 几何 smoke 通过，动画/关联资源矩阵待补 |
| SketchUp SKP | mesh-3d | 组件几何与变换、基础材质和内嵌 PNG/JPEG；可取消 Worker | 3 | implemented；v17/v25 固定样例解析测试；79 MiB 用户模型真实 Chrome 加载、视角与缩放通过 |
| 3MF / AMF | print-3d | 构建几何、单位；3MF 组件与变换 | 3 | implemented；固定样例 smoke 与结构测试通过 |
| ASCII PCD / XYZ | point-cloud | 有界渐进代表性抽样 | 2 | implemented；5000 点固定样例 smoke 通过；非完整 LOD |
| USDZ package | archive | 有界列出包内条目，无 USD 几何 | 2 | implemented |

`implemented` 和单个 smoke 通过不等于原文定义的完整 `verified`。

## 2. 规划候选矩阵

下表用于安排 spike 和证据，不是 Manifest 清单。只有完成对应实现与验收后才能改为 `implemented` 或 `verified`。

| 格式族 | 代表扩展名 | 领域 | 计划路径 | 首个有意义目标 | 当前状态 |
|---|---|---|---|---|---|
| DXF | `.dxf` | CAD | DXF parser → line/mesh adapter → `rendering-3d` | 保留 XYZ、图层、标准视图和 orbit；二维文件不回归 | implemented，见第 1 节及限制 |
| STL | `.stl` | 网格/打印 | ASCII/binary parser → indexed mesh | 几何、法线、尺寸、orbit 和资源上限 | implemented，见第 1 节及限制 |
| glTF / GLB | `.gltf`, `.glb` | CG | glTF loader + workspace resolver | 层级、mesh、常见 PBR 材质、纹理、相机；动画按证据声明 | implemented，见第 1 节及限制 |
| OBJ / MTL | `.obj`, `.mtl` | 网格/CG | OBJ parser + workspace MTL/texture resolver | 多对象、材质和合法关联纹理 | implemented，见第 1 节及限制 |
| PLY | `.ply` | 网格/点 | ASCII/binary parser | mesh/point、顶点颜色和大小边界 | implemented，见第 1 节及限制 |
| OFF | `.off` | 网格 | 轻量 parser | 几何与颜色的基础查看 | implemented，见第 1 节及限制 |
| 3MF | `.3mf` | 3D 打印 | 有界 ZIP/XML parser | 构件、单位、颜色/材质、尺寸与构建信息 | implemented，见第 1 节及限制 |
| AMF | `.amf` | 3D 打印 | 有界 XML parser | 未压缩对象/单位/几何与常量材质颜色 | implemented 子集 |
| STEP | `.step`, `.stp` | 精确 CAD | CAD Worker/WASM → tessellation | 装配、名称、颜色、单位、实体面与边线 | implemented 子集 |
| IGES | `.iges`, `.igs` | 精确 CAD | CAD Worker/WASM → tessellation | 常见曲面/实体的可见几何与单位 | implemented 子集 |
| BREP | `.brep` | 精确 CAD | CAD Worker/WASM → tessellation | 拓扑与 tessellated 显示；单位未知 | implemented 子集 |
| DWG | `.dwg` | CAD | LibreDWG 0.14 本地 Worker；模型空间几何、基础文字、缓存标注与填充 | 128 MiB 文件；替代字体；不含布局、外参、代理与 ACIS 实体 | cad-dwg，等级 3；部分图元近似 |
| FBX / DAE / 3DS | `.fbx`, `.dae`, `.3ds` | CG | 按格式动态 loader | 常见静态 mesh、层级与材质 | candidate |
| USD / USDZ | `.usd`, `.usda`, `.usdc`, `.usdz` | CG/AR | USD-aware runtime 独立评估 | composition、引用、mesh、材质和动画的明确子集 | blocked pending provider |
| LAS / LAZ | `.las`, `.laz` | 点云 | Worker + 有界 LAZ WASM | 坐标抽样预览，不显示属性；LAZ 压缩输入上限 128 MiB | implemented Lv.2 子集 |
| PCD / XYZ | `.pcd`, `.xyz` | 点云 | 流式 Worker / 代表性抽样 | ASCII XYZ 几何；点属性待完成 | implemented 子集 |
| E57 | `.e57` | 点云 | 专用 Worker/WASM | 扫描分组、坐标和有界点加载 | candidate |
| G-code toolpath | `.gcode` 等 | 3D 打印 | 流式指令 parser → line segments | 分层刀路/打印路径查看，不模拟实际打印 | candidate |

## 3. 组合级证据要求

### 网格与 CG

必须记录：

- ASCII/binary、版本和压缩组织；
- triangle/line/point primitive；
- indexed/non-indexed、法线、顶点色和 UV；
- 节点、实例、材质、纹理、相机和动画的实际范围；
- embedded 与 workspace 关联资源；
- 顶点、三角形、纹理和 GPU 预算；
- 当前目标浏览器、固定样例和真实等级。

### CAD

必须记录：

- 2D/3D、实体类型、图层、块/实例和装配；
- 单位、坐标系、模型/图纸空间和保存视图；
- B-Rep 到 tessellation 的容差与边线策略；
- 原始精确结构是否保留、哪些属性只做 metadata；
- Worker/WASM 峰值内存、取消和固定样例；
- 缺失的 CAD 语义对等级的实际影响。

### 3D 打印

必须记录：

- 单位、对象/构件、变换和 build item；
- mesh、颜色、材质、纹理与缩略图；
- 尺寸和包围盒是否可靠；
- 是否只查看，不能把没有实现的修复、切片或可打印性检查写成能力。

### 点云

必须记录：

- 点格式、坐标精度、颜色、强度、分类和扫描 metadata；
- 总点数、分块、LOD、常驻点预算和抽样策略；
- 大坐标 rebasing 和目标环境帧率；
- “代表性抽样”与“完整可导航点云”的支持等级差异。

## 4. 状态变更规则

- 只有 parser/renderer 路径真实存在，才能从 `planned` 改为 `implemented`；
- 只有固定样例、反例、资源上限、生命周期测试和真实浏览器 smoke 齐全，才能改为 `verified`；
- 理论上被 Three.js loader、OpenCascade 或其他库支持，不等于项目已支持；
- 只有 metadata 或压缩包条目时保持等级 1–2，不能因文件属于 3D 格式就宣传 3D 预览；
- 同一扩展名的子格式或资源组织能力不同，应拆成组合记录，不用一个等级覆盖全部变体。

## SketchUp SKP 接入

- 解析：锁定 OpenSKP 1.3.0（MIT），仅在 SKP Worker 中加载；内部 GLB 交给已有本地 glTF adapter，不上传或导出文件。
- 支持：新式 VFF 与解析器可识别的旧版 MFC 容器；组件实例保留共享几何与变换，坐标为米、Y-up。PNG/JPEG 内嵌纹理复用现有像素预算与缺图降级。
- 不覆盖：独立边线、标注、样式、保存相机、动态组件行为；不保证所有 SketchUp 版本兼容。
- 预算：输入 128 MiB；ZIP 单条目 512 MiB、累计展开 768 MiB、4096 条目；几何与纹理编码累计 128 MiB；600 万顶点、4096 节点/绘制、64 层深度；解析 60 秒后终止 Worker。最终渲染仍受共享 GPU/纹理预算限制。
- 样例及来源：`viewer/plugins/mesh-3d/examples/README.md`；真实 Chrome 视觉与交互验收待用户操作。

### 2026-10-04 大型 SKP 修复

79 MiB 的用户模型内含 262.6 MiB `model.dat`、282.0 MiB 总展开数据，旧的 64/128 MiB ZIP 预算在解析前拒绝它。直接放开预算时，OpenSKP 1.3.0 会把 F901/7017/7117 整个定义表递归物化，耗尽 Node 默认约 4 GiB 堆。

通过 pnpm 锁定的 `patches/openskp@1.3.0.patch` 改为按定义解析 TLV，保持组件与几何语义；本地同文件解析约 12 秒，输出 1,827,257 顶点、549 节点、517 绘制批次，几何 63.0 MiB、内嵌纹理 13.1 MiB。结束时进程 RSS 约 2.7 GiB（不是峰值或浏览器内存保证）。此证据支持提高展开预算，几何/GPU 等其他预算不变。

60 张纹理合计 64,807,075 像素，共享 glTF adapter 总纹理额度改为 64 × 1024² 像素（RGBA 256 MiB；不含 mipmap 与渲染器开销），覆盖该工作负载。SKP Worker 传递结构化超限原因和数值；解析器内部 RangeError 与主动预算、超时分开显示。

私有模型不纳入仓库。可用 `SKP_TEST_FILE=/absolute/path/to/model.skp pnpm --filter @anyfile/mesh-3d-viewer test` 运行实际解析与纹理预检回归。

真实 Chrome 验收：使用原始 SKP 单文件，经完整 Worker → GLB adapter → WebGL 流程显示 1,827,257 顶点、1,015,976 三角面与材质纹理；Top/Isometric 视图及缩放操作通过。更改 npm patch 后需刷新旧开发页面，避免热更新残留的模块/Worker。

### 共享 3D 漫游

非平面文档提供自由漫游与观察点放置。漫游使用透视相机，拖动/方向键环顾，WASD 水平移动，Q/E 沿文档 up 轴升降，触屏可用步进按钮。漫游时滚轮、触摸板双指上下滑动或捏合调节垂直视野角（20°–100°），不改变观察位置；捏合张开放大、合拢缩小，仅在漫游画布上接管手势，浏览器键盘缩放快捷键保留。速度支持慢/正常/快；已知单位按米换算眼高和移动速度，未知单位明确显示模型单位。无重力和碰撞，可穿墙。

放置观察点仅在点击或选择画面中心时拾取可见网格，在表面上方显示眼高标记，确认后进入；不会自动识别地板，也不会穿透屋顶寻找房间。取消放置或返回总览恢复之前的相机、缩放和 orbit 目标。失焦/隐藏/图形上下文丢失时停止移动；无输入时不持续渲染。平面文档保留原有查看方式。

漫游验收（2026-10-04）：真实 Chrome 打开用户 Living Room.skp，完成中心表面拾取、确认进入、下降穿过屋顶、水平步进、拖动室内环顾和返回原总览。共享渲染器 12 项测试通过（含 10 项导航测试），应用 123 项回归通过，ESLint、TypeScript、生产构建与 bundle/asset 检查通过。
