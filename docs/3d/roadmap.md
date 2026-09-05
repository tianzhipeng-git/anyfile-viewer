# 3D 文件查看实施路线图

> 实施状态见 [implementation-status.md](implementation-status.md)；本文保留目标设计，不能把全部条目视为已完成。
- 状态：部分实施；阶段 0–5 已有代码和首轮验证，仍有未完成要求
- 范围：CAD、通用网格、CG 场景、3D 打印和点云的浏览器本地只读查看
- 共享基础设施：已建立的 `@anyfile/rendering-3d`，不是可注册的查看器插件
- 相关文档：[3D 文件查看架构](architecture.md)、[支持矩阵](support-matrix.md)

## 1. 排序和交付原则

候选优先级依次评价：

1. 用户遇到频率和无需安装桌面软件即可查看的价值；
2. 是否已有维护活跃、许可清楚、可锁定的浏览器 parser/loader；
3. 是否能取得真实、可再分发且覆盖关键变体的固定样例；
4. 主要几何、层级、单位和关联资源是否能形成有意义预览；
5. 大文件、纹理、压缩、Worker/WASM、GPU 与取消边界是否可控；
6. 复用共享 3D runtime 是否确实减少重复，而不是制造格式分支；
7. 领域增强对支持等级和用户理解的实际价值。

路线图以经过验证的“格式组合”衡量覆盖，不以 Manifest 扩展名数量、Three.js 理论 loader 数量或 CAD kernel 理论格式列表衡量。

每个组合不可放松的交付底线：

- 主要几何在初始视图中可见；
- orbit/pan/zoom/fit 与 resize 稳定，二维文件有合理默认投影；
- 坐标方向、单位和 bounds 不被静默破坏；
- 关联资源缺失、格式损坏、环境缺失和资源超限给出准确结果；
- opening abort、active abort、连续切换和重复 dispose 后没有 Worker、WASM、Object URL、GPU 或 frame loop 残留；
- 用户文件和关联资源不上传，也不自动请求模型内远程 URL；
- 重型实现不进入 Manifest、probe、`/view` 首包或无关插件。

## 2. 阶段 0：证据、依赖与 runtime spike

### 工作

- 为 DXF 3D line、ASCII/binary STL、GLB、glTF 外部 buffer/texture、OBJ/MTL、PLY 和 3MF 建立首批固定样例；
- 每个容器族准备损坏、截断、伪装、极端计数和关联资源缺失样例；
- 锁定 Three.js 候选版本，审核许可证、维护状态、tree-shaking、WebGL 能力和 addons 加载边界；
- 用独立 spike 验证 renderer、正交/透视 camera、orbit、fit、标准视图、resize、context lost 和 dispose；
- 测量 Three.js runtime 与每个候选 loader 的 raw/gzip chunk；
- 测量代表性模型的解析时间、首屏时间、峰值 JS/WASM 内存、GPU buffer、draw call 和交互帧率；
- 定义格式族初始输入、几何、纹理、压缩和 GPU 预算；
- 验证 WebGL 不可用、低纹理上限和 context lost 的错误/恢复策略；
- 确认 Worker 消息使用 Transferable，主线程不复制大型 TypedArray。

### 完成标准

- 架构、支持矩阵、样例来源和依赖审计一致；
- Three.js 只存在于实验性完整插件 chunk，不进入首包或 probe；
- DXF line 和 STL triangle 两类 primitive 均能通过同一 runtime 显示；
- 资源预算有测量依据，不使用浏览器 OOM 作为失败条件；
- spike 的所有 GPU、监听、frame 和 Worker 资源可重复清理；
- 未达到底线的格式保持 planned/blocked，不提前进入 Manifest。

## 3. 阶段 1：共享 runtime、DXF 线框与 STL

阶段 1 同时接入一个线框 CAD 文件和一个三角网格文件，用两个真实调用方约束共享 API。

### `@anyfile/rendering-3d`

- 新建独立 workspace 包并精确锁定 Three.js；
- 实现 renderer/camera 生命周期、按需 render loop、ResizeObserver 和 DPR；
- 实现 orbit、pan、zoom、fit、reset、标准视图和正交/透视切换；
- 实现线、点、mesh 的基础材质和主题背景；
- 实现 geometry/material/texture/render target/renderer 的幂等释放；
- 提供最小 toolbar/viewport DOM，保留插件添加领域 UI 的位置；
- 添加坐标空间、空/单点/共线 bounds、大坐标 rebasing 和资源预算测试；
- 添加真实浏览器 WebGL smoke 和生产 chunk 门禁。

### DXF

- 将当前 `CadPoint` 扩展为 XYZ，不能在 scene parser 中丢弃 Z；
- 区分二维共面工程图与三维线框；
- 二维默认顶视正交投影，三维默认等轴测或有证据的文件视图；
- 支持顶、前、右、等轴测和自由 orbit；
- 增加图层列表、显示/隐藏、全部显示、单独查看，并遵守 layer off/frozen；
- 保留 BYLAYER/BYBLOCK 颜色、block transform 和常见实体能力；
- 文件内 named view、UCS、paper space/layout 不阻塞首期，但必须如实声明；
- 使用桌面 `bridge.dxf` 对三维 line、标准视图和 orbit 做真实验收；
- 迁移后重新评估插件 ID 和支持等级，不能让旧 `cad-2d` 与新路径重复竞争。

### STL

- 有界区分 binary 与 ASCII，不能只根据 `solid` 前缀判断；
- 渲染 triangle mesh，处理合法法线并为缺失/无效法线建立明确策略；
- 显示可靠的 triangle count、bounds、尺寸和单位未知状态；
- 提供实体/线框切换，不承诺网格修复、流形检查或切片；
- 验证大 triangle count、退化面、NaN、截断和资源超限。

### 完成标准

- DXF 2D、DXF 3D line 和 STL 共用 runtime，但 parser 和领域 UI 无交叉分支；
- `/Users/tianzhipeng/Desktop/design_files/bridge.dxf` 可以从多个标准视图观察并自由旋转，Z 不再丢失；
- 现有二维 DXF 的方向、颜色、fit、文本和取消行为无回归；
- STL 的 binary/ASCII 正常、损坏和超限样例均有证据；
- 真实浏览器中连续切换 DXF/STL 后没有 GPU 或事件残留；
- `/view` 首包和非 3D 插件不包含 Three.js 或 STL/DXF 完整实现。

## 4. 阶段 2：常见网格与 CG 交换格式

### 首批范围

优先依次评估：

1. GLB；
2. glTF + workspace buffer/texture；
3. OBJ + MTL + workspace texture；
4. PLY mesh/point；
5. OFF。

GLB 优先，因为它能以单文件验证 mesh、节点、材质、纹理和 animation 基础，而不先引入关联文件复杂度。

### 工作

- 为每种格式保留独立 probe 和内部动态 loader；
- 建立受控 workspace resource resolver，拒绝远程 URL、绝对路径和目录逃逸；
- 支持格式声明范围内的节点、实例、法线、UV、顶点色和常见材质；
- glTF/GLB 按实际支持记录 skin、morph、animation、camera、Draco、Meshopt 和 KTX2；
- OBJ 记录负索引、group/object、smoothing、MTL 与纹理路径行为；
- PLY 分别验证 ASCII/binary little/big endian、mesh/point 和顶点属性；
- 对 decoder、纹理和可选压缩 runtime 保持条件动态加载；
- scene tree、动画和相机 UI 只在文档确实包含对应内容时出现。

### 完成标准

- 每个扩展名只声明已完成的版本、primitive 和资源组织；
- GLB 与 workspace 多文件场景都不会访问网络；
- 材质或局部纹理失败不会无依据地销毁仍可查看的几何；
- animation 文件如果不能正确播放，降低支持等级并明确限制；
- 纹理像素、节点、draw call、顶点和 GPU 预算有固定反例；
- loader 继续按格式拆分，不因一个 mesh/CG 插件把全部 addons 打进同一 chunk。

## 5. 阶段 3：3D 打印语义

### 首批范围

- 3MF；
- AMF；
- STL 继续保留已有几何路径，不重复解析；
- G-code toolpath 另按需求和格式歧义评估。

### 工作

- 3MF 使用有界 ZIP/XML 解析，限制 entries、展开量、关系、对象和资源；
- 解析 object、component、build item、transform、unit、颜色/材质和受支持纹理；
- 显示真实尺寸、构件列表和可选构建板参考；
- AMF 处理 unit、object、volume、material 和 constellation 的明确子集；
- 对非流形、自交、薄壁等只显示经过验证的诊断，不把启发式结果宣传成可打印性结论；
- 不实现模型修复、摆放编辑、支撑、切片或导出。

### 完成标准

- 主要构件、变换、单位和尺寸正确；
- 压缩炸弹、XML 深度/计数和纹理预算有明确防护；
- 同一 STL 不因领域插件竞争产生重复重型解析；
- 支持等级反映打印语义，而不是只因增加构建板 UI 提高。

## 6. 阶段 4：精确 CAD 交换格式

### 先行 spike

- 比较受维护的 OpenCascade WebAssembly 包、其他可审计 CAD kernel 和不引入精确内核的降级方案；
- 记录被拒绝方案的维护、安全、许可、体积、CSP、Worker、线程和 API 原因；
- 先用 STEP、IGES 各一组小型/大型真实样例验证装配、颜色、单位、tessellation、边线和取消；
- 测量 WASM 下载、初始化、峰值 memory、tessellation 时间和输出复制；
- 决定采用锁定上游包还是进入源码构建流程；普通应用构建不得现场编译 CAD kernel。

### 首批交付候选

- STEP/STP 的常见 AP203/AP214/AP242 静态几何子集；
- IGES 的常见曲面/实体子集；
- BREP 仅在同一 kernel 路径有清晰证据后加入；
- DWG 保持独立 provider/许可评审，不通过服务端转换或扩展名改名绕过。

### 完成标准

- 主要实体面和边线可见，不以 metadata 或 bounding box 冒充 CAD 预览；
- 装配实例、名称、颜色、单位和坐标变换在声明范围内正确；
- tessellation 容差、triangle/edge 输出和峰值内存有边界；
- Worker 可以取消，dispose 后释放 WASM、输出 buffer 和 GPU 资源；
- 重型 CAD runtime 按实际体积进入正确的版本化资产链路；
- 未验证的 kernel 理论格式不进入 Manifest 和支持文案。

## 7. 阶段 5：点云

### 候选顺序

1. PCD /简单 XYZ；
2. LAS；
3. LAZ；
4. E57。

### 工作

- 分别定义格式字段、坐标精度、颜色、强度、分类和扫描 metadata；
- 建立 Worker 分块读取、抽样和 LOD；
- 大坐标使用 origin rebasing；
- renderer 按视锥、屏幕误差和常驻点预算更新 GPU chunk；
- 区分代表性抽样预览与完整可导航点云的支持等级；
- LAZ/E57 decoder 或 WASM 单独审核许可、体积、内存和取消。

### 完成标准

- 首屏不等待全部点进入内存和 GPU；
- 总点数远大于常驻预算时仍可渐进查看；
- 属性着色与抽样不会被误表述为完整语义；
- 快速 orbit、切换和 dispose 不遗留加载任务或 GPU buffer。

## 8. 阶段 6：按需求增强

只有真实用户需求和性能证据出现后再评估：

- 测量、剖切、爆炸视图和 section box；
- CAD model/paper space、layout、named view 和 UCS；
- 隐藏线、轮廓线和更高质量边线；
- glTF 高级压缩、KTX2、skin、morph 和完整 animation；
- USD/USDZ、FBX、DAE、3DS 的更深格式语义；
- mesh/point cloud LOD、progressive mesh 和 WebGPU；
- 辅助截图或缩略图缓存，但仍不得上传用户文件。

增强阶段不阻塞继续扩大满足底线的新格式覆盖。若某项缺失会导致主要内容错误或不可理解，则它不是增强项，必须回到对应格式阶段修复或降低支持等级。

## 9. 每阶段共同门禁

- 更新架构、支持矩阵、Manifest、catalog 和真实能力文案，不能互相漂移；
- 固定样例来源、许可证、生成方式和关键参数可审计；
- probe 有界且不导入 Three.js、完整 loader、Worker 或 WASM；
- parser/loader/decoder 版本精确锁定，源码构建资产遵守独立规范；
- opening/active abort、错误、连续切换、重复 dispose 和 DOM 所有权测试通过；
- 真实浏览器验证视觉结果、交互、resize、context lost 和资源释放；
- 记录输入、展开、几何、纹理、内存、GPU、首屏和帧率观测；
- `pnpm test`、`pnpm lint`、`pnpm build` 全部通过；
- 构建门禁确认新增 runtime 只进入对应延迟 chunk。
