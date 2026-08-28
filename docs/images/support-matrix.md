# 图片格式支持矩阵

- 状态：实施前模板
- 事实来源：真实浏览器验证、固定测试样例和锁定依赖

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

仓库目前没有专用图片插件。网站 catalog 中出现扩展名不等于查看器已经支持该格式，因此本表不把 catalog 声明记作实现。

| 格式族 | 扩展名示例 | 目标插件族 | 当前等级 | 状态 | 近期目标 | 说明 |
|---|---|---|---:|---|---:|---|
| JPEG | `.jpg` `.jpeg` `.jfif` | browser image | 0 | planned | 4 | 验证 EXIF orientation、ICC 和大尺寸限制 |
| PNG/APNG | `.png` `.apng` | browser image | 0 | planned | 4 | APNG 与普通 PNG 共享扩展名 |
| GIF | `.gif` | browser image | 0 | planned | 4 | 包含动画、循环和帧时序 |
| WebP | `.webp` | browser image | 0 | planned | 4 | 覆盖有损、无损、alpha 和动画 |
| AVIF | `.avif` | browser image | 0 | planned | 4 | 运行时验证目标浏览器能力 |
| SVG | `.svg` `.svgz` | safe vector image | 0 | planned | 3 | 安全策略未决，不与普通栅格同时上线 |
| TGA/PNM | `.tga` `.pnm` `.pbm` `.pgm` `.ppm` `.pam` | general raster | 0 | planned | 4 | 用于验证自定义像素链路 |
| TIFF/BigTIFF | `.tif` `.tiff` `.btf` | general raster | 0 | planned | 4 | 多压缩、多页、tile 和 ICC 需逐项声明 |
| HEIF/HEIC | `.heif` `.heic` | general raster | 0 | deferred | 3 | 先评估 codec、许可、WASM 和浏览器差异 |
| JPEG XL | `.jxl` | general raster | 0 | deferred | 4 | 不依赖单一浏览器的临时支持状态 |
| 相机 RAW | `.dng` `.cr2` `.cr3` `.nef` `.arw` `.raf` | camera RAW | 0 | deferred | 2 | 首期倾向内嵌预览，完整显影另立目标 |
| PSD/PSB | `.psd` `.psb` | layered document | 0 | deferred | 3 | 先合成预览与图层元数据 |
| ORA/KRA | `.ora` `.kra` | layered document | 0 | deferred | 3 | 利用规范中的合成预览，不承诺编辑语义 |
| DDS | `.dds` | GPU texture | 0 | deferred | 5 | mip、array、cubemap 和 BC family |
| KTX/KTX2 | `.ktx` `.ktx2` | GPU texture | 0 | deferred | 5 | 评估 Khronos 官方 WASM |
| GeoTIFF/COG | `.tif` `.tiff` | geospatial raster | 0 | deferred | 5 | 与普通 TIFF 的插件选择边界未决 |
| DICOM | `.dcm` 等 | medical image | 0 | deferred | 5 | 多 transfer syntax、序列和医学元数据 |
| NIfTI/NRRD | `.nii` `.nii.gz` `.nrrd` | volume/scientific | 0 | deferred | 5 | 需要体数据和方向语义 |
| FITS | `.fits` `.fit` `.fts` | volume/scientific | 0 | deferred | 5 | 需要数值窗口和 colormap |

## 4. 每个格式必须记录的维度

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

### 资源限制

- 最大输入文件；
- 最大 width、height、depth、总像素/体素；
- 最大帧、页、图层、tile 或 mip 数；
- 解码后内存与缓存预算；
- 是否支持区域、分片、流式或按需解码。

### 实现与部署

- browser / JS / WASM / Worker / GPU 路径；
- 依赖名、精确版本、许可证和上游地址；
- 首次加载和 gzip 体积；
- Worker/WASM 等静态资产；
- 支持浏览器与运行时能力检测；
- 是否能够 abort，以及 dispose 释放哪些资源。

### 验证证据

- 正常真实样例；
- 每个声明子格式至少一个样例；
- 损坏、截断和极端尺寸样例；
- 自动测试名称；
- 桌面窄窗口、矮窗口和高 DPR 手工结果；
- 跨浏览器显示差异和已知缺失。
