# 图片格式支持矩阵

- 状态：阶段 0、阶段 1 已完成验收
- 事实来源：真实渲染验证、固定测试样例和锁定依赖

## 1. 支持等级

支持等级是全项目协议概念。路由时，它由候选插件针对当前具体文件动态返回；本表中的“当前等级”和“近期目标”只是经过验证的能力记录与产品目标，不是 Manifest 中的静态路由值。

| 等级 | 全项目含义 | 图片领域示例 |
|---:|---|---|
| 0 | 不支持当前文件 | 文件损坏、并非该格式或使用完全不支持的变体 |
| 1 | 可靠检查底层字节、元数据或结构 | 尺寸/类型元数据、Hex、无法解码的 TIFF 结构 |
| 2 | 代表性预览 | 内嵌缩略图、RAW 预览、PSD 合成缩略图 |
| 3 | 主要内容可用，但有明确的重要缺失 | 扁平化 PSD、只支持首帧或部分压缩变体 |
| 4 | 在声明范围内完整查看主要内容和常见语义 | 完整 JPEG/PNG、受支持的多页 TIFF |
| 5 | 在等级 4 基础上提供必要领域导航或交互 | GeoTIFF band/tile、DICOM 序列、图层查看 |

等级表示插件对该文件实际能提供的能力，不表示格式理论能力。控件数量不构成更高等级，对格式的营销文案不得超过这里记录的已验证能力。

## 2. 状态值

- `planned`：已经进入路线图，但尚未实现；
- `spike`：正在验证浏览器或第三方依赖；
- `implemented`：代码存在，尚未完成全部验收；
- `verified`：完成矩阵要求的自动和手工验收；
- `blocked`：存在已记录的技术、许可或样例阻塞；
- `deferred`：当前没有足够产品价值，不进入近期计划。

## 3. 当前基线

仓库已包含按需加载的 `browser-image` 插件。下表只记录固定样例、自动测试和真实浏览器 smoke test 覆盖到的能力；catalog 中的其他扩展名不因此自动获得支持。

| 格式族 | 扩展名示例 | 目标插件族 | 当前等级 | 状态 | 近期目标 | 说明 |
|---|---|---|---:|---|---:|---|
| JPEG | `.jpg` `.jpeg` `.jfif` | browser image | 4 | verified | 4 | 原生 `<img>`；浏览器负责 EXIF orientation 与 ICC，固定样例覆盖 baseline JPEG |
| PNG | `.png` | browser image | 4 | verified | 4 | 原生 `<img>`；固定样例覆盖 RGBA PNG |
| APNG | `.png` `.apng` | browser image | 4 | verified | 4 | 原生动画；容器检查声明帧数，固定样例覆盖循环动画 |
| GIF | `.gif` | browser image | 4 | verified | 4 | 原生动画；解析帧与透明索引，固定样例覆盖循环动画 |
| WebP | `.webp` | browser image | 4 | verified | 4 | 固定样例覆盖有损、无损 alpha 与循环动画 |
| AVIF | `.avif` | browser image | 4 | verified | 4 | 当前只声明单帧 AVIF；`avis` 图像序列返回 0 |
| SVG | `.svg` `.svgz` | safe vector image | 0 | planned | 3 | 安全策略未决，不与普通栅格同时上线 |
| TGA/PNM | `.tga` `.pnm` `.pbm` `.pgm` `.ppm` `.pam` | general raster | 0 | planned | 4 | 用于验证自定义像素链路 |
| TIFF/BigTIFF | `.tif` `.tiff` `.btf` | general raster | 0 | planned | 4 | 多压缩、多页、tile 和 ICC 需逐项声明 |
| HEIF/HEIC | `.heif` `.heic` | general raster | 0 | deferred | 3 | 先评估 codec、许可、WASM 和运行时能力 |
| JPEG XL | `.jxl` | general raster | 0 | deferred | 4 | 评估原生解码或自带 decoder 的可行性 |
| 相机 RAW | `.dng` `.cr2` `.cr3` `.nef` `.arw` `.raf` | camera RAW | 0 | deferred | 2 | 首期倾向内嵌预览，完整显影另立目标 |
| PSD/PSB | `.psd` `.psb` | layered document | 0 | deferred | 3 | 先合成预览与图层元数据 |
| ORA/KRA | `.ora` `.kra` | layered document | 0 | deferred | 3 | 利用规范中的合成预览，不承诺编辑语义 |
| DDS | `.dds` | GPU texture | 0 | deferred | 5 | mip、array、cubemap 和 BC family |
| KTX/KTX2 | `.ktx` `.ktx2` | GPU texture | 0 | deferred | 5 | 评估 Khronos 官方 WASM |
| GeoTIFF/COG | `.tif` `.tiff` | geospatial raster | 0 | deferred | 5 | 与普通 TIFF 的插件选择边界未决 |
| DICOM | `.dcm` 等 | medical image | 0 | deferred | 5 | 多 transfer syntax、序列和医学元数据 |
| NIfTI/NRRD | `.nii` `.nii.gz` `.nrrd` | volume/scientific | 0 | deferred | 5 | 需要体数据和方向语义 |
| FITS | `.fits` `.fit` `.fts` | volume/scientific | 0 | deferred | 5 | 需要数值窗口和 colormap |

## 4. 阶段 1 读取与资源策略

- 原生 `<img>` 路径不设置固定的输入大小、像素、帧数或估算内存上限；这些阈值缺少跨浏览器、跨设备的可靠依据。
- probe 与 `open()` 最多读取前 1 MiB 做格式和基础元数据识别；只有 `open()` 会通过原始 `File` 的 Object URL 让当前浏览器尝试解码。
- 插件不在 JavaScript 中复制完整编码文件，也不创建 RGBA Canvas 像素副本。实际解码容量由浏览器和设备资源决定。
- 对超过头部范围的动画不展示可能不完整的帧数统计。AVIF sequence 仍因阶段范围而拒绝，而非因帧数阈值拒绝。
- 后续 JS/WASM/Canvas 解码器如果自行分配内存，应根据其真实分配、缓存和并发模型设置针对性边界。

## 5. 阶段 1 验证证据

- 自生成正常样例：baseline JPEG、RGBA PNG、循环 APNG、循环 GIF、有损/无损 alpha/循环 WebP、单帧 AVIF。
- 异常样例：每个格式族至少包含损坏或截断文件；样例清单位于 `viewer/plugins/image/examples/README.md`。
- 自动测试：格式容器解析、probe 0/4、协议 Manifest、完整打开、opening abort、active abort、重复 dispose、Object URL 释放、容器 DOM 所有权和中英文错误。
- 部署检查：`browser-image` manifest 静态加载；probe 与完整插件使用不同动态入口；`anyfile-image-viewer__viewport` 不得出现在 `/view` 初始 bundle。
- 真实浏览器 smoke（2026-08-28，Chromium）：六种样例均经完整插件入口解码为 96×64；APNG/GIF/WebP 截图帧发生变化；缩放、旋转、连续切换、360×640 窄窗口与 900×320 矮窗口通过。原生 `<img>` 不创建需要单独同步 DPR 的 Canvas 像素面。

## 6. 每个格式必须记录的维度

实施后，每个格式或子格式增加独立条目，至少包含：

### 格式识别

- 扩展名和复合扩展名；
- magic bytes / 必要结构校验；
- 支持和拒绝的版本、profile、compression；
- 伪装扩展名、空文件、截断文件的行为。

### 内容能力

- 单帧、动画、多页、图层、tile、volume 或 texture；
- bit depth、channel、alpha 和 palette；
- EXIF/TIFF orientation；
- ICC、色彩空间、HDR 和 tone mapping；
- 元数据、缩略图和关联文件。

### 资源行为

- 是否设置应用层输入、尺寸或元素数量边界，以及设置或不设置的依据；
- 解码后内存、缓存和并发由浏览器还是插件负责；
- 是否支持区域、分片、流式或按需解码。

### 实现与部署

- browser / JS / WASM / Worker / GPU 路径；
- 依赖名、精确版本、许可证和上游地址；
- 首次加载和 gzip 体积；
- Worker/WASM 等静态资产；
- 所需运行时能力检测；
- 是否能够 abort，以及 dispose 释放哪些资源。

### 验证证据

- 正常真实样例；
- 每个声明子格式至少一个样例；
- 损坏、截断和极端尺寸样例；
- 自动测试名称；
- 桌面窄窗口、矮窗口和高 DPR 手工结果；
- 已知渲染缺失。
