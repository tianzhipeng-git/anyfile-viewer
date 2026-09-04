# 3D 文件查看支持矩阵

- 状态：当前能力与规划候选的事实记录
- 口径：`implemented` 表示代码路径存在，`verified` 表示已有固定样例和自动/真实环境证据；规划目标不等于当前支持
- 相关文档：[3D 文件查看架构](architecture.md)、[实施路线图](roadmap.md)

## 1. 当前已实现能力

| 格式/组合 | 当前插件 | 当前结果 | 当前等级口径 | 状态 | 主要限制 |
|---|---|---|---:|---|---|
| ASCII DXF 常见二维图元 | `cad-2d` | Canvas 2D 几何预览 | 3 | `verified` | 合并显示全部图层；仅使用 XY；没有图层开关、CAD 原生视图、布局或三维相机 |
| ASCII DXF 三维 `LINE` 线框 | `cad-2d` | 只显示 XY 投影 | probe 返回 3，实际能力至多 2，存在待修正错配 | `implemented` | Z 被忽略，不能切换前/侧/等轴测或自由旋转；不得宣传为三维支持 |
| USDZ package | `archive` | 有界列出包内条目 | 2 | `implemented` | 不解析 USD scene，不渲染几何、材质、动画或 AR placement |

当前仓库没有 `@anyfile/rendering-3d`，也没有已注册的 STL、OBJ、PLY、glTF/GLB、3MF、STEP、IGES 或点云渲染插件。

## 2. 规划候选矩阵

下表用于安排 spike 和证据，不是 Manifest 清单。只有完成对应实现与验收后才能改为 `implemented` 或 `verified`。

| 格式族 | 代表扩展名 | 领域 | 计划路径 | 首个有意义目标 | 当前状态 |
|---|---|---|---|---|---|
| DXF | `.dxf` | CAD | DXF parser → line/mesh adapter → `rendering-3d` | 保留 XYZ、图层、标准视图和 orbit；二维文件不回归 | planned |
| STL | `.stl` | 网格/打印 | ASCII/binary parser → indexed mesh | 几何、法线、尺寸、orbit 和资源上限 | planned |
| glTF / GLB | `.gltf`, `.glb` | CG | glTF loader + workspace resolver | 层级、mesh、常见 PBR 材质、纹理、相机；动画按证据声明 | planned |
| OBJ / MTL | `.obj`, `.mtl` | 网格/CG | OBJ parser + workspace MTL/texture resolver | 多对象、材质和合法关联纹理 | planned |
| PLY | `.ply` | 网格/点 | ASCII/binary parser | mesh/point、顶点颜色和大小边界 | planned |
| OFF | `.off` | 网格 | 轻量 parser | 几何与颜色的基础查看 | planned |
| 3MF | `.3mf` | 3D 打印 | 有界 ZIP/XML parser | 构件、单位、颜色/材质、尺寸与构建信息 | planned |
| AMF | `.amf` | 3D 打印 | 有界 XML parser | 对象、单位、材质与几何 | candidate |
| STEP | `.step`, `.stp` | 精确 CAD | CAD Worker/WASM → tessellation | 装配、名称、颜色、单位、实体面与边线 | planned spike |
| IGES | `.iges`, `.igs` | 精确 CAD | CAD Worker/WASM → tessellation | 常见曲面/实体的可见几何与单位 | planned spike |
| BREP | `.brep` | 精确 CAD | CAD Worker/WASM → tessellation | 拓扑与 tessellated 显示 | candidate |
| DWG | `.dwg` | CAD | 许可和 parser 独立评估 | 不以 DXF parser 或服务端转换冒充支持 | blocked pending provider |
| FBX / DAE / 3DS | `.fbx`, `.dae`, `.3ds` | CG | 按格式动态 loader | 常见静态 mesh、层级与材质 | candidate |
| USD / USDZ | `.usd`, `.usda`, `.usdc`, `.usdz` | CG/AR | USD-aware runtime 独立评估 | composition、引用、mesh、材质和动画的明确子集 | blocked pending provider |
| LAS / LAZ | `.las`, `.laz` | 点云 | Worker parser/decompressor + LOD | 分块点云、属性着色与点预算 | candidate |
| PCD / XYZ | `.pcd`, `.xyz` | 点云 | 流式/分块 parser | 常见字段、点颜色和有界预览 | candidate |
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
