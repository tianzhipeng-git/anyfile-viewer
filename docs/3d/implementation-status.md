# 3D 实施情况与证据 — 2026-09-05

这是实施台账。架构和路线图描述的是更宽的目标范围；其中尚未勾选的要求，不能视为已完成功能。

## 已交付代码路径

| 路径 | 已实现范围 | 剩余格式限制 |
|---|---|---|
| DXF（`cad-2d`，保留现有 ID） | XYZ 线/点/实体几何、采样曲线、文本 sprite、Z 方向 block 缩放/平移、图层显隐、标准视图/orbit | Binary DXF、通用 OCS extrusion、精确 spline、layout 和原生字体仍未支持或仍为简化实现；文本始终朝向相机 |
| STL（`mesh-3d`） | 严格的 ASCII/binary 三角面解析、基于大小的 binary 判定、Worker 取消、几何法线、尺寸、实体/线框 | 单位未知；不支持修复或切片；原始法线会被重新计算 |
| OBJ | 通过锁定版本的 `OBJLoader` 支持对象、面、负索引，本地 MTL 和简单 `map_Kd` | 其他纹理贴图/选项会提示后忽略；大文本解析仍为同步且有上限 |
| PLY | 通过锁定版本的 `PLYLoader` 支持 ASCII/binary 大小端变体、面或点、顶点颜色 | 大输入仍为整块 buffer 读取且有上限；无 LOD |
| OFF | 基础多边形几何 | 不支持颜色变体；polygon fan 三角化假定多边形为凸多边形 |
| glTF/GLB | glTF 2.0 场景、本地/内嵌 buffer、常见材质、PNG/JPEG 纹理检查、通过 loader 支持 skin/morph、动画选择与播放 | 未配置 Draco、Meshopt 和 KTX2；不支持 external-buffer-view 图片；动画样例已在 Chrome 验证；未实现场景相机选择 |
| 3MF（`print-3d`） | 包根关系、ZIP 预算与输出计数、build item、递归 component、transform、单位和对象基础颜色 | 不支持纹理/逐面属性及必需扩展；不宣称可打印性结论 |
| AMF | 未压缩 XML 的 object/volume/triangle、固定 object/volume/material RGB 与单位 | 未实现 curved triangle、ZIP 编码和 constellation |
| ASCII PCD/XYZ（`point-cloud`） | Worker 流式读取、4,096 点后给出首帧快照、上限 200,000 的确定性 reservoir sample、origin rebasing | 仅为等级 2 的代表性预览；未实现颜色/强度/分类、binary PCD 和完整可导航 LOD |

| STEP/STP、IGES/IGS、BREP（`cad-exchange`） | 有边界的源码构建 OCCT Worker、曲面、面边界、装配名称、面颜色、STEP/IGES 统一归一到 mm | 输入上限 16 MiB；BREP 单位未知；仅支持 tessellation 后的查看；已知畸形输入通告/残余风险见 `dependency-audit.md` |
| LAS/LAZ（`point-cloud`） | LAS 1.x 记录坐标、scale/offset 和分块读取；单独按需加载的有界 LAZ decoder；共用同一渐进抽样路径 | LAZ 先读取最多 64 MiB 压缩输入；无点属性、扫描语义和完整 LOD |

共享的 `@anyfile/rendering-3d` 包没有 Manifest 或 probe。它的真实调用方是 DXF、mesh、打印、CAD exchange 和 point-cloud 插件。它负责相机、`OrbitControls`、resize/DPR、按需帧渲染、动画帧、对象可见性、context 恢复和 GPU 释放。为 fit 而进行的显示调整不会改写原始单位。

## 已取得证据

- 生产构建、完整 `pnpm test`（最终代码检查点共 702 个测试）、TypeScript 和 lint 均已通过。额外的 CAD 继承测试与 glTF 图结构回归测试也已单独通过。
- `/view` 初始 JavaScript 实测为 214.1 KiB gzip；完整 3D viewer 入口分组约为 152–154 KiB gzip，probe 小于 1 KiB。原始浏览器结果见 [browser-smoke.json](browser-smoke.json)。
- 本地真实 Chrome/WebGL 已打开 ASCII/binary STL、GLB、OBJ、PLY、OFF、3MF、AMF、ASCII PCD/XYZ，以及用户桌面的 `bridge.dxf`。
- 每个固定样例都覆盖了 orbit、前视/等轴测视图、投影切换和 resize。
- bridge 几何在 XYZ 三个方向上都有非零尺寸：文件未声明单位时约为 `0.11181 × 0.089746 × 0.039991`。前视和等轴测截图展示的是实际桥梁结构在不同投影下的结果。
- `WEBGL_lose_context` 能触发本地 lost-state 提示并恢复渲染。
- 切换回文本查看后：3D root 数量为 0，跟踪到的 Worker 实例数也为 0；smoke 运行中没有页面错误。这不等于已经证明所有浏览器下原生 GPU 内存都归零。
- 该次本地运行中，小样例首个 canvas 延迟为 29–109 ms。这些是体量很小、且部分为热加载的结果，不代表大模型性能基准，也不代表冷网络 SLA。
- 固定样例中的四面体和螺旋线由项目自行生成，采用 Apache-2.0，并附带生成脚本。私有桌面模型没有复制进仓库。
- 测试覆盖 STL 编码/截断/NaN、资源路径、坏几何索引、共享释放、DXF Z 坐标、3MF transform/cycle/XML entity，以及采样逻辑。

## 当前预算

这些是偏保守的初始实现上限，**并不宣称**已经根据峰值内存测量调优完成。完整压力测量仍未完成。

- mesh/print 输入：64 MiB；DXF 保留现有 64 MiB 上限。
- OBJ：200 万源顶点、400 万 UV/normal 记录、300 万展开后的 primitive 顶点、4096 个 group，以及 65,536 字符的拼接记录；预算检查发生在 `OBJLoader` 之前。
- STL：1,000,000 个三角面；DXF：200,000 个展开实体 / 3,000,000 个 primitive 顶点。
- 共享场景：6,000,000 个唯一几何顶点、256 MiB attribute/index buffer、4,096 个 draw group。该保护发生在解析后、GPU 上传前。
- 外部资源：128 MiB；PNG/JPEG 单张纹理输入 16 MiB、单轴 8,192、单张 16,777,216 像素；纹理总量按资源组受限。
- 3MF：2,048 个 ZIP entry、64 MiB 声明展开量、单 entry 32 MiB、压缩比 200；实际流式输出不得超过声明总量和单 entry 上限。
- XML：源文件 32 MiB、深度 64、1,000,000 个元素；component 深度 32 / 4,096 个实例。
- PCD/XYZ/LAS：输入 2 GiB；LAZ：压缩输入 64 MiB、WASM heap 256 MiB；单行 65,536 字符，常驻采样点 200,000。

## 路线图中仍未完成的部分

整份路线图**尚未完成**。尤其包括：

- 完整的 CAD 对抗样例覆盖、上游 parser 通告问题的解决，以及自定义 kernel 的公开 Git commit/jsDelivr 分发；
- E57 parser 集成与完整点云 LOD/导航；
- 可选的 DWG/USD provider、FBX/DAE/3DS 和 G-code 工作；
- 更高级的压缩、完整材质/打印语义，以及源文件相机 UI；
- 完整的对抗样例矩阵、JS/WASM/GPU 峰值内存测量、持续交互基准，以及 Chrome/Edge/Firefox/Safari 覆盖；
- 测量、剖切、爆炸视图以及其他条件性增强能力。

不要因为 Three.js 或其他上游宣称有某个 loader，就把这些项标记为已交付。也不要仅因为更广泛验证仍在进行，就把已实现注册项改成 level 0；需按 protocol v2 的要求，把实现范围和验证状态分开记录。

## 额外测量证据

真实 Chrome 结果见 [CAD/point smoke](cad-point-browser-smoke.json) 与 [更大样例和取消测试](stress-smoke.json)。STEP 立方体尺寸为 300 mm；IGES 立方体为 10 mm；BREP 装配已渲染出曲面和边线。LAS 的 5,000 点 survey-offset helix 保留了 `2 × 2 × 4.999` 的尺寸范围；上游 LAZ 样例产出了 1,065 个点。每个完成的 Worker 都已终止。缺失和远程 glTF 纹理在给出提示后仍保留几何，且没有外部请求；动画在播放时会改变 canvas 像素，暂停后保持稳定。

项目生成的 10 万三角面 binary STL（5,000,084 字节）首帧出现在 222 ms；100 万点 XYZ（36,890,000 字节）在 61 ms 时先显示 4,096 个点，并在 436 ms 时完成到 20 万常驻点。加载后的主 realm JS heap 观测值分别约为 17.4 MB 和 33.3 MB。这些只是本地单次观测，不是 Worker/原生/GPU 峰值测量，也不是跨设备承诺。打开过程取消后没有残留 Worker 或 3D root。

Docker LAZ 重建方面：在锁定的 Linux/amd64 镜像中，两次干净构建产出了相同的 JS/WASM SHA-256。当前审查产物使用的就是该 Docker 输出。OCCT 的 Docker 全量重建在通告审查期间被中断；其原生产物和 recipe 已保留，但跨构建验证仍未完成。

额外浏览器检查也已通过：glTF + external buffer、OBJ + MTL、binary little-endian PLY 和 binary big-endian PLY；页面没有错误。样例选择器选择了多个真实本地文件，以覆盖已授权的内存工作区读取路径。
