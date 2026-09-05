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
| DWG | `.dwg` | CAD | 许可和 parser 独立评估 | 不以 DXF parser 或服务端转换冒充支持 | blocked pending provider |
| FBX / DAE / 3DS | `.fbx`, `.dae`, `.3ds` | CG | 按格式动态 loader | 常见静态 mesh、层级与材质 | candidate |
| USD / USDZ | `.usd`, `.usda`, `.usdc`, `.usdz` | CG/AR | USD-aware runtime 独立评估 | composition、引用、mesh、材质和动画的明确子集 | blocked pending provider |
| LAS / LAZ | `.las`, `.laz` | 点云 | Worker + 有界 LAZ WASM | 坐标抽样预览，不显示属性；LAZ 压缩输入上限 64 MiB | implemented Lv.2 子集 |
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
