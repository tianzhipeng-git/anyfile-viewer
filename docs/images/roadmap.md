# 图片查看实施路线图

- 状态：阶段 0-3 已完成验收，SVG 安全预览已实现自动验收；
- 原则：每阶段产生一个可验证的用户能力，不以创建抽象层作为完成目标

## 1. 排序方法

格式优先级不只按“浏览器原生、摄影、设计、科学、医学”分类，还要同时评价：

1. 用户遇到频率和预览价值；
2. 补齐合法测试材料和验证记录的成本；样例可以自生成、人工取得或只用于本地手工验收，暂缺可再分发样例不阻止实现和诚实声明待验证支持；
3. 是否有维护中的浏览器实现或可锁定依赖；
4. 包体积、WASM、Worker 和静态资产成本；
5. 大文件、解压炸弹和主动内容风险；
6. 能否给出明确、诚实的支持等级；
7. 是否能够复用已经验证的查看基础能力。

## 2. 阶段 0：建立可验收基线

### 工作

- 完成首批格式测试样例清单；
- 明确各实现路径的资源策略；原生浏览器解码不设置无依据的统一硬阈值，自定义解码路径按真实分配模型定义边界；
- 建立支持矩阵更新规则；
- 将项目统一的 0–5 级动态支持等级映射到图片领域产品文案；
- 建立“扩展名候选 → 可选 probe → 动态等级排序”的协议测试基线；
- 记录图片插件的协议合规和真实渲染 smoke test 要求。

### 完成标准

- JPEG、PNG/APNG、GIF、WebP、AVIF 均有正常和异常样例；
- 资源策略有明确依据并记录，不在实现时临时拍脑袋；
- catalog、格式页面与支持矩阵使用同一支持口径。
- probe、完整插件和首包的动态加载边界可验证。

在这些条件满足前，不开始构建通用图片框架。

## 3. 阶段 1：浏览器原生栅格试点

### 范围

- JPEG；
- PNG/APNG；
- GIF；
- WebP；
- AVIF。

SVG 不自动包含在此阶段，因为它有独立的主动内容和外部资源风险。

### SVG 安全预览实施结果（2026-08-29）

- 新增独立 `safe-svg` 插件，不把 SVG 并入普通栅格的原始 Object URL 解码路径。
- `.svg` 与 `.svgz` 经完整读取、解压和 XML 校验后，移除主动内容、事件、样式、动画和外部引用，再以新的 SVG Blob 交给原生 `<img>`；代码查看器继续作为 `.svg` 源码检查备选。
- 输入和解压后内容上限为 16 MiB，元素上限为 100,000；因安全清理会造成明确的格式能力缺失，动态支持等级为 3。
- 已覆盖真实 SVG、伪装/损坏输入、安全清理、资源上限、probe 与生命周期自动测试；真实浏览器 SVGZ、窄窗口和矮窗口 smoke 留作发布前手工验收。

### 产品能力

- 查看单帧和动画；
- fit、actual size、缩放、平移和旋转；
- 展示文件名、尺寸、格式和基础元数据；
- 处理 EXIF orientation、alpha 和浏览器可用的色彩信息；
- 损坏文件和浏览器不支持时提供准确错误；自定义解码路径达到已声明资源边界时返回资源错误；
- 连续切换、取消和 dispose 后无资源残留。

### 技术原则

- 首选 `<img>` + Object URL；
- 不为统一而先转 Canvas；
- 不在阶段开始前引入 Lit、d3-zoom 或通用 scene model；
- 只实现当前插件实际需要的最小 UI 和输入处理；
- `open()` 通过浏览器实际解码结果确认运行时能力，不用格式名称代替打开阶段校验。
- Probe 根据当前文件的有界头部识别结果返回等级 0 或 4，不在 Manifest 中写死等级，也不为排序解码完整文件。

### 完成标准

- 所有声明格式通过协议合规、正常/损坏样例和真实渲染 smoke test；
- 动画时序由浏览器正确播放，切换文件后停止；
- 高 DPR、窄窗口、矮窗口和大图行为经过手工验证；
- 初始 `/view` bundle 不包含图片插件实现；
- probe 与完整图片插件分别按需加载，probe 不静态带入 renderer；
- 支持矩阵更新为实际验证结果。

## 4. 阶段 2：自定义栅格解码试点

### 实施结果（2026-08-28）

- 新增独立 `general-raster` 插件，覆盖 TGA、P1–P7 Netpbm 和已验证 classic TIFF 子集，并让相同底层结构的 TGA 别名、BigTIFF、pyramidal TIFF、GeoTIFF 与 OME-TIFF 进入候选；不完整的领域语义通过动态 probe 降级，而不是从 Manifest 排除。BigTIFF 的 64-bit IFD 路径已实现，验证状态与运行时能力等级分开记录。
- TGA/Netpbm 使用插件内 decoder；TIFF 使用锁定的 `geotiff@3.0.5`（MIT）。完整 decoder、Worker、Canvas UI 与 TIFF 依赖均不进入 manifest 或 probe chunk。
- 解码在专用 Worker 中执行，宿主取消时终止 Worker；RGBA8 非预乘缓冲通过 transferable 返回主线程。
- Canvas 视口实现 DPR、ResizeObserver、`requestAnimationFrame` 合并重绘、fit/actual、缩放、平移、旋转和幂等资源释放；第一款 Canvas 插件仍保留局部实现，未提前提取公共包。
- TIFF 使用 Blob 分片读取，支持 strip/tile、多页及固定样例覆盖的 None、LZW、Deflate、PackBits、JPEG 压缩；ICC 只识别不转换的文件动态降为等级 3 并明确提示。
- 应用层边界为 TGA/Netpbm 输入 256 MiB、单页 64 Mi 像素、TIFF 1024 页、Canvas 单边 8192 物理像素；所有像素分配前检查安全整数和边界。
- 固定真实样例、损坏/截断样例、协议生命周期、生产构建和首包门禁均通过。当前自动化浏览器无法访问本机服务，因此窄/矮窗口、高 DPR、真实 Worker 与多页交互的手工 Chromium 验收仍需在可连接环境补跑，不据此标记为 `verified`。

### 建议顺序

1. TGA 或 PNM：结构相对明确，用于验证自定义像素输出；
2. TIFF：验证多种压缩、多页、tile、ICC 和大文件读取。

具体选择要在依赖、样例和用户价值调查后确认。

### 要验证的问题

- decoder 输出的 bit depth、alpha、色彩空间和 orientation 契约；
- Worker 取消和 transferable buffer；
- Canvas DPR、resize 和重绘调度；
- 解码后内存预算与区域/按页读取；
- 自定义路径和浏览器原生路径能否共享同一套用户交互；
- TIFF 与 GeoTIFF probe 如何针对同一个 `.tif` 返回动态等级并产生正确排序。

### 公共层提取门槛

第一款 Canvas 插件可以保留局部实现。只有出现第二个调用方，并观察到相同的状态、生命周期和测试需求后，才提取：

- canvas surface；
- viewport/zoom controller；
- render scheduler；
- resource scope。

提取完成不是本阶段目标；减少已经发生的重复才是目标。

## 5. 阶段 3：现代摄影与 RAW

### 实施结果（2026-08-28）

- 新增 `modern-raster` 插件。JPEG XL 先使用原生 `ImageDecoder`，否则在专用 Worker 中按需加载 `jxl-oxide-wasm@0.12.6`；固定生成样例覆盖有损、无损 alpha、两帧动画、损坏和截断文件，真实 WASM 测试验证 96×64 两帧循环动画。
- HEVC HEIF/HEIC 使用有界 BMFF probe，原生实际解码失败后按需加载独立的同源 `libheif 1.23.2 + libde265 1.1.1` Worker/WASM；当前只显示 primary image，因此动态等级为 3。
- 新增 `camera-raw` 插件，注册 DNG、CR2、CR3、CRW、NEF、NRW、ARW、SR2、SRF、RAF、ORF、PEF、RWL、RAW 和 RW2。轻量 probe 校验 TIFF、Olympus ORF、Canon CR2/CR3、Canon CIFF、Panasonic RAW 与 RAF 容器；当前提供内嵌预览和基础显影，因此对识别出的文件返回等级 2，型号验证状态单独记录。
- RAW 完整插件锁定 `libraw-wasm@1.6.0`，提取内嵌预览后在后台执行相机白平衡、相机矩阵、8-bit sRGB 和文件方向的基础显影，并允许在内嵌预览与显影结果之间切换。输入上限为 256 MiB，输出上限为 64 Mi 像素。
- `/view` 使用 COOP/COEP 响应头满足 pthread WASM；环境不是 `crossOriginIsolated` 时返回 `unsupported-environment`。JXL、RAW Worker/WASM 均保持在插件动态入口之后。
- `@anyfile/viewer-rendering` 已从两款既有图片插件的真实重复中提取 viewport、输入、Canvas DPR surface、帧调度和资源清理；没有同时引入 Lit、d3-zoom 或 scene model。
- 当前还没有按型号维护的自动回归语料；已有桌面真实文件的手工验收记录，因此 RAW 以等级 2 交付。后续可以通过可再分发 fixture、人工补充的真实文件或可审计的手工验收记录扩大型号覆盖并更新验证状态。样例是否能够提交到仓库不作为格式进入 Manifest 或声明待验证支持的门禁；支持等级应由实际可提供的查看能力和已知缺失决定。

HEVC HEIF/HEIC 的跨浏览器本地解码回退已按 [HEIC / HEIF 跨浏览器支持方案](heic-heif-support-plan.md) 实施；审核产物、对应源码/替换说明和许可证材料随分发提供。

### 候选范围

- HEIF/HEIC；
- JPEG XL；
- DNG 和常见厂商 RAW。

### 分级交付

RAW 至少拆为以下递进能力，不把序号直接当作协议支持等级：

- 元数据；
- 内嵌缩略图；
- 内嵌全尺寸 JPEG 预览；
- 完整 RAW 解码；
- 去马赛克、白平衡、相机 profile 和 tone mapping。

较低等级可以先交付，但 UI 必须说明正在显示内嵌预览，不能称为完整显影。

### 进入条件

- 选定 decoder 有明确维护状态；
- WASM/Worker 资产可以在现有部署中稳定加载；
- 已规划目标相机和子格式的验证方式；可再分发样例优先，也允许人工取得的真实文件和有记录的本地验收；
- 峰值内存和打开时间可测量；
- 色彩准确度的验收范围已经定义。

## 6. 阶段 4：专业设计与 GPU texture

### PSD/PSB 实施结果（2026-09-04）

- `photoshop-document` 插件声明 `.psd` 与 `.psb`；有界 probe 区分 PSD version 1 与 PSB version 2，并校验各自的尺寸上限。
- `ag-psd@31.0.2` 在专用 Worker 中读取 PSD/PSB 结构并解码保存的合成图，跳过图层像素、缩略图和链接文件；两种格式当前支持等级均为 3，不把扁平预览描述成图层级完整查看。
- UI 展示可缩放、平移和旋转的合成图，以及尺寸、位深、颜色模式、图层总数与可见图层数；不提供图层切换、重新合成、编辑或保存。
- 输入、像素和解码内存分别设置显式边界；Worker、transferable RGBA、ImageBitmap、Canvas 与事件由 abort/dispose 统一释放。
- 自动测试覆盖生成的 PSD 与 PSB；生产首包门禁已通过。复杂真实 PSD/PSB 与跨尺寸手工 smoke 尚待补充，因此验证状态为 `implemented`。

### 图层文档

- PSD：已完成合成预览与图层数量；下一步是图层列表，再评估分层合成；
- PSB：已在 256 MiB 输入与 64 Mi 像素边界内提供合成预览；更大的真实大型文档需要分片读取或降级预览路径；
- ORA/KRA：优先读取规范内的合成预览和图层元数据；
- XCF 等格式按样例、依赖和需求再排期。

不以“完整复刻原编辑器”为目标。Adobe 的 PSD/PSB 公开规范也明确区分存储描述与内容解释，私有格式不作完整支持承诺。

### GPU texture

- DDS；
- KTX/KTX2；
- Basis Universal。

该查看器需要 mip、array、cubemap、channel 和颜色/法线贴图查看方式。KTX2 优先评估 Khronos 官方 WASM，而不是自行实现转码器。

图层文档和 GPU texture 只共享通用 UI/视口，不应合并为一个实现插件。

## 7. 阶段 5：垂直领域

GIS、医学和科学数据分别立项：

| 领域 | 第一候选 | 必要领域能力 |
|---|---|---|
| GIS / 遥感 | GeoTIFF、COG | overview、tile、band、nodata、地理元数据 |
| 医学二维/序列 | DICOM | transfer syntax、序列、window/level、方位和敏感元数据 |
| 医学/科学体数据 | NIfTI、NRRD | slice、spacing、orientation、colormap、体渲染 |
| 科学图像 | FITS | HDU、数值窗口、colormap 和大数组读取 |

HDF5、NetCDF 不因为可以保存数组就自动归入图片查看器。它们首先是通用数据容器；只有明确的数据集语义和用户需求才增加专用可视化候选。

### 进入条件

- 有对应领域的真实用例，并已规划样例、合成数据或手工验收方式；
- 确定采用领域库还是自建 adapter；
- 明确单文件与工作区序列的关系；
- 敏感元数据、隐私和本地处理边界经过评审；
- 领域术语和交互具有可验证的正确性。

## 8. 每个格式的交付清单

- manifest、可选 probe 与完整实现按需分离；
- probe 对真实文件返回 0–5，取消、异常和无 probe 默认等级 1 的行为通过测试；
- 扩展名、magic bytes 和子格式校验；
- 正常、损坏、截断和伪装测试；实现声明应用层资源边界时增加对应超限测试；
- 打开、opening abort、active abort 和重复 dispose；
- 不修改容器外 DOM；
- 不遗留 Object URL、Worker、ImageBitmap、Canvas 或 GPU 资源；
- 不发送文件或解析结果到外部网络；
- 真实格式渲染 smoke test；
- 窄窗口、矮窗口、高 DPR 和超宽/超高内容手工验证；
- 生产 build、首包和插件 chunk 检查；
- 更新支持矩阵、catalog 和用户文案。

## 9. 停止条件

出现以下任一情况时，不通过堆叠 workaround 强行发布：

- decoder 无法可靠取消或释放资源；
- 实测表明 decoder 无法稳定覆盖拟声明范围，且无法通过缩小范围、动态降级或准确错误来诚实交付；
- 格式只能通过上传到第三方服务处理；
- 峰值内存无法受控；
- 依赖进入首包或污染无关插件且无法隔离；
- 只能展示可能误导用户的错误颜色、方向或领域数据。

此时把条目标记为 `blocked` 或降低支持等级，并记录具体原因。仅缺少固定或可再分发样例时保持 `implemented` / 待验证，继续补充验证材料，不得据此把已经实现且能够准确识别、打开的格式写成不支持或移出 Manifest。
