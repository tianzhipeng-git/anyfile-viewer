# 图片格式支持矩阵

- 状态：阶段 0-3 已完成验收，SVG 安全预览已实现自动验收；
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
- `implemented`：代码存在并可诚实描述当前能力，尚未完成全部验收；缺少固定或可再分发样例通常属于此状态，不等于不支持；
- `verified`：完成矩阵要求的自动和手工验收；
- `blocked`：存在已记录且确实阻止实现或安全交付的技术、许可或部署问题；
- `deferred`：当前没有足够产品价值，不进入近期计划。

## 3. 当前基线

仓库已包含按需加载的 `browser-image` 插件。下表只记录固定样例、自动测试和覆盖到的能力；catalog 中的其他扩展名不因此自动获得支持。

| 格式族 | 扩展名示例 | 目标插件族 | 当前等级 | 状态 | 近期目标 | 说明 |
|---|---|---|---:|---|---:|---|
| JPEG | `.jpg` `.jpeg` `.jpe` `.jfif` `.jif` `.jfi` `.pjpeg` `.pjp` | browser image | 4 | verified | 4 | 原生 `<img>`；浏览器负责 EXIF orientation 与 ICC，固定样例覆盖 baseline JPEG |
| PNG | `.png` | browser image | 4 | verified | 4 | 原生 `<img>`；固定样例覆盖 RGBA PNG |
| APNG | `.png` `.apng` | browser image | 4 | verified | 4 | 原生动画；容器检查声明帧数，固定样例覆盖循环动画 |
| GIF | `.gif` | browser image | 4 | verified | 4 | 原生动画；解析帧与透明索引，固定样例覆盖循环动画 |
| WebP | `.webp` | browser image | 4 | verified | 4 | 固定样例覆盖有损、无损 alpha 与循环动画 |
| AVIF（单帧） | `.avif` | browser image | 4 | verified | 4 | 原生 `<img>`；固定样例覆盖单帧 AVIF |
| AVIF sequence | `.avif` | browser image | 3 | verified | 3 | 浏览器动画支持存在差异；以实际 decode 结果为准 |
| AVIF 的 HEIF 扩展名 | `.heif` `.heifs` `.hif` | browser image | 3–4 | verified | 4 | IANA 为 `image/avif` 登记的扩展名；仅接受 `avif`/`avis` brand，不把 HEVC HEIF 误报为 AVIF |
| BMP/DIB | `.bmp` `.dib` | browser image | 3 | verified | 3 | 常见 BMP 可原生查看，较少见的压缩与内部表示可能无法解码 |
| ICO/CUR | `.ico` `.cur` | browser image | 3 | verified | 3 | 可查看浏览器选取的图标/光标画面，不提供容器内多尺寸导航 |
| SVG | `.svg` `.svgz` | safe SVG | 3 | implemented | 3 | 独立插件；移除脚本、事件属性、动画、样式与外部引用后通过原生 `<img>` 预览，代码查看器仍可检查源码 |
| TGA | `.tga` `.icb` `.vda` `.vst` | general raster | 4 | verified | 4 | raw/RLE；灰度、真彩色、调色板；15/16/24/32 bit；应用四种 origin；后三者按相同 TGA 结构 probe |
| Netpbm | `.pnm` `.pbm` `.pgm` `.ppm` `.pam` | general raster | 4 | verified | 4 | P1–P7；文本/二进制；1/8/16 bit；PAM 灰度、RGB 与 alpha tuple |
| classic TIFF（无 ICC） | `.tif` `.tiff` | general raster | 4 | verified | 4 | unsigned 1–16 bit、alpha、orientation；strip/tile、多页；固定样例覆盖 None、LZW、Deflate、PackBits、JPEG |
| classic TIFF（带 ICC） | `.tif` `.tiff` | general raster | 3 | verified | 3 | profile 可识别但未转换，UI 明确标注 `ICC 未应用` |
| BigTIFF | `.tf8` `.btf` `.btiff` `.tif` `.tiff` | general raster | 4 | implemented | 4 | 64-bit IFD probe 与解码路径已实现；合成头覆盖格式识别，完整文件回归仍待补充，因此验证状态为 `implemented`，不据此降低运行时能力等级 |
| pyramidal TIFF | `.ptif` `.ptiff` | general raster | 3–4 | verified | 4 | 作为 tiled/multi-page TIFF 打开；能查看像素和页面，但不承诺厂商私有金字塔语义 |
| OME-TIFF | `.ome.tif` `.ome.tiff` `.ome.tf2` `.ome.tf8` `.ome.btf` | general raster | 3 | implemented | 5 | 可查看 TIFF 像素和页面；暂不解释 OME-XML 的 Z/C/T 维度语义 |
| HEVC HEIF/HEIC | `.heif` `.heifs` `.hif` `.heic` | modern raster | 3 | implemented | 3 | 原生实际解码优先，失败后使用同源 `libheif 1.23.2 + libde265 1.1.1` Worker/WASM；显示 primary image，不提供辅助项或序列导航 |
| JPEG XL | `.jxl` | modern raster | 4 | verified | 4 | 原生 ImageDecoder 优先，`jxl-oxide-wasm@0.12.6` Worker 回退；固定样例覆盖有损、无损 alpha 与动画 |
| 相机 RAW | `.dng` `.cr2` `.cr3` `.crw` `.nef` `.nrw` `.arw` `.sr2` `.srf` `.raf` `.orf` `.pef` `.rwl` `.raw` `.rw2` | camera RAW | 2 | verified | 3 | 内嵌预览与 LibRaw 基础显影已实现；桌面真实文件已手工验证当前交付能力为等级 2。型号级自动回归覆盖仍待补充，但它不限制新增已实现格式以 `implemented` / 待验证状态进入 Manifest |
| PSD/PSB | `.psd` `.psb` | layered document | 0 | deferred | 3 | 先合成预览与图层元数据 |
| ORA/KRA | `.ora` `.kra` | layered document | 0 | deferred | 3 | 利用规范中的合成预览，不承诺编辑语义 |
| DDS | `.dds` | GPU texture | 0 | deferred | 5 | mip、array、cubemap 和 BC family |
| KTX/KTX2 | `.ktx` `.ktx2` | GPU texture | 0 | deferred | 5 | 评估 Khronos 官方 WASM |
| GeoTIFF/COG | `.tif` `.tiff` `.gtif` `.gtiff` `.geotif` `.geotiff` | general raster；未来 geospatial raster | 3 | implemented | 5 | 当前查看普通像素/页面，检测到空间标签时降级；不解释 CRS、坐标或 band 语义 |
| DICOM | `.dcm` 等 | medical image | 0 | deferred | 5 | 多 transfer syntax、序列和医学元数据 |
| NIfTI/NRRD | `.nii` `.nii.gz` `.nrrd` | volume/scientific | 0 | deferred | 5 | 需要体数据和方向语义 |
| FITS | `.fits` `.fit` `.fts` | volume/scientific | 0 | deferred | 5 | 需要数值窗口和 colormap |

## 4. 阶段 1 读取与资源策略

- 原生 `<img>` 路径不设置固定的输入大小、像素、帧数或估算内存上限；这些阈值缺少跨浏览器、跨设备的可靠依据。
- probe 与 `open()` 最多读取前 1 MiB 做格式和基础元数据识别；只有 `open()` 会通过原始 `File` 的 Object URL 让当前浏览器尝试解码。
- 插件不在 JavaScript 中复制完整编码文件，也不创建 RGBA Canvas 像素副本。实际解码容量由浏览器和设备资源决定。
- 对超过头部范围的动画不展示可能不完整的帧数统计。BMP/DIB、ICO/CUR 和 AVIF sequence 以等级 3 进入候选，最终由当前浏览器实际解码。
- 后续 JS/WASM/Canvas 解码器如果自行分配内存，应根据其真实分配、缓存和并发模型设置针对性边界。

## 5. 阶段 1 验证证据

- 自生成正常样例：baseline JPEG、RGBA PNG、循环 APNG、循环 GIF、有损/无损 alpha/循环 WebP、单帧/循环 AVIF、BMP v3、ICO 和 CUR。
- 异常样例：每个格式族至少包含损坏或截断文件；样例清单位于 `viewer/plugins/browser-image/examples/README.md`。
- 自动测试：格式容器解析、probe 0/4、协议 Manifest、完整打开、opening abort、active abort、重复 dispose、Object URL 释放、容器 DOM 所有权和中英文错误。
- 部署检查：`browser-image` manifest 静态加载；probe 与完整插件使用不同动态入口；`anyfile-browser-image-viewer__viewport` 不得出现在 `/view` 初始 bundle。
- 真实浏览器 smoke（2026-08-28，Chromium）：六种样例均经完整插件入口解码为 96×64；APNG/GIF/WebP 截图帧发生变化；缩放、旋转、连续切换、360×640 窄窗口与 900×320 矮窗口通过。原生 `<img>` 不创建需要单独同步 DPR 的 Canvas 像素面。
- 扩展格式 smoke（2026-08-28，Chromium）：BMP 解码为 96×64，ICO/CUR 解码为 96×96，2 帧 AVIF sequence 解码为 96×64；其他目标浏览器仍以运行时 decode 结果为准，因此维持等级 3。
- 真实浏览器手工验收（2026-08-29）：`viewer/plugins/browser-image/examples/` 中全部正常、损坏和截断样例均通过。

## 6. SVG 读取、资源与验证证据

- `safe-svg` 使用独立 Manifest、probe 和完整插件入口，不改变普通栅格插件的原始文件直解码路径；`.svg` 同时保留代码查看器作为源码检查备选。
- 输入与 SVGZ 解压后内容均限制为 16 MiB，DOM 元素限制为 100,000 个；SVGZ 使用浏览器 `DecompressionStream`，缺少能力时返回 `unsupported-environment`。
- 完整打开拒绝 DOCTYPE、格式错误和非 SVG XML；移除脚本、`foreignObject`、嵌入式主动内容、SMIL 动画、事件属性、`style` 以及非本地 URL，再把序列化结果作为新的 `image/svg+xml` Blob 交给 `<img>`。
- 当前等级为 3：安全清理会有意移除样式、动画与外部资源，因此不承诺与原文件像素级一致；自动测试覆盖真实 SVG、伪装文件、主动内容清理、资源上限、probe、取消、重复 dispose 和 Object URL 释放。真实浏览器窄/矮窗口与 SVGZ smoke 尚待发布前手工验收。

## 7. 阶段 2 读取、资源与验证证据

- probe 最多读取前 1 MiB，并与完整插件、Worker、Canvas UI 和 `geotiff` 保持独立动态入口。
- TGA/Netpbm 完整读取前检查 256 MiB 输入上限；TIFF 通过 `geotiff.fromBlob()` 分片读取，不创建完整编码文件副本。
- 单页最多 64 Mi 像素，TIFF 最多 1024 页，Canvas backing store 单边最多 8192 物理像素。
- Worker 终止承担 opening/active abort；成功结果的 RGBA8 非预乘缓冲通过 transferable 返回；ImageBitmap、ResizeObserver、animation frame、事件与 Worker 由幂等 `dispose()` 释放。
- 自动测试覆盖真实样例解码、probe 0/3/4、扩展名候选、损坏/截断、极端尺寸、alpha、orientation、opening/active abort、重复 dispose 与 DOM 所有权。
- `pnpm test`、`pnpm lint`、`pnpm build` 通过；`/view` 初始 JavaScript 为 200.8 KiB gzip，未包含 Canvas UI 或 TIFF decoder 标记。完整插件入口约 5.6 KiB gzip，Worker 核心约 14.8 KiB gzip，压缩 decoder 继续按需拆分。
- 真实浏览器手工验收（2026-08-29）：`viewer/plugins/general-raster/examples/` 中全部正常、损坏和截断样例均通过；已覆盖 TGA raw/RLE、Netpbm P1–P7，以及 TIFF strip/tile、多页、8/16 bit、alpha、orientation 和 None/LZW/Deflate/PackBits/JPEG 压缩。

## 8. 阶段 3 验证证据

- modern-raster 的 JPEG XL 输入上限为 256 MiB；HEIC 原生路径沿用 256 MiB 通用上限，WASM 回退输入上限为 128 MiB；两者解码后均不得超过 64 Mi 像素，JPEG XL 另外限制为 4096 个关键帧。
- 真实浏览器手工验收（2026-08-29）：`viewer/plugins/modern-raster/examples/` 中全部正常、损坏和截断样例均通过，覆盖 HEVC HEIC primary image，以及 JPEG XL 有损、无损 alpha 和两帧动画。
- HEIC fallback 自动验收（2026-08-29）：独立 Worker 中的 `1.23.2-anyfile.1` 产物把固定样例解码为 96×64 straight-alpha RGBA8；自动测试覆盖无原生能力时的打开、opening/active abort、重复 dispose、DOM 所有权和资源释放。NCLX/ICC、方向、alpha、10-bit、grid 与真实手机大图仍需随扩展语料持续回归，因此状态保持 `implemented`、等级保持 3。
- 桌面真实文件手工验收（2026-08-29）：`raw_images/` 中 16 个文件全部通过；其中 13 个相机 RAW 文件覆盖 DNG、CR2、CRW、NEF、ARW、RWL、RAW、RW2，另外覆盖 PGM、PAM 和 JPEG XL。该结果确认 RAW 当前等级 2，不构成型号级回归语料，也不将 RAW 提升为等级 3。
- 新增 RAW 桌面验收（2026-08-30）：使用 `raw_images/` 中 Nikon COOLPIX P7100 NRW、Sony DSC-R1 SR2、Sony DSC-F828 SRF、Olympus C5050Z ORF、Pentax *ist DL PEF。五个文件的有界 probe 均返回等级 2，项目锁定的 LibRaw WASM 均成功读取相机元数据、提取 JPEG 缩略图并生成 8-bit RGB 基础显影。

## 9. 每个格式必须记录的维度

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
