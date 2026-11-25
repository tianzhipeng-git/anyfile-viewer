# 图片查看架构及支持矩阵

本文件记录图片、设计图、RAW、医学影像与全景照片的共享架构约定、当前支持矩阵与安全/许可结论。各插件具体实现与验证命令见 `viewer/plugins/*/README.md`。

## 1. 架构与渲染约定

- **插件分族**：`browser-image`（原生栅格与可控动画）、`safe-svg`（安全清理 SVG/SVGZ）、`general-raster`（TGA/Netpbm/TIFF/BigTIFF/OME-TIFF）、`hdr-image`（OpenEXR/Radiance HDR 高动态范围与 360° HDRI）、`modern-raster`（JPEG XL/HEIC）、`camera-raw`（LibRaw RAW）、`photoshop`（PSD/PSB 合成图）、`pixelmator-pxd`、`dicom`（医学影像）、全景照片（`dji-osmo`、`gopro-max`、`insta360`）。
- **像素契约**：不建设统一 `ImageDocument`；所有自解码路径必须明确位深、通道排列、alpha 预乘状态、方向与色彩空间，严禁重复应用 EXIF orientation、ICC 转换、alpha 预乘或 tone mapping。
- **渲染器选型**：原生格式直接用 `<img>` + Object URL（避免 JS 复制整文件与额外 RGBA 缓冲，支持 ImageDecoder 的动画按需启用帧控制）；自解码栅格用 Worker 解码 + `Transferable` RGBA8 交给 `@anyfile/viewer-rendering`（`InteractiveViewport` / `CanvasSurface`）；全景与科学影像使用专用 WebGL/Canvas 渲染。
- **安全与隐私**：`safe-svg` 拒绝 DOCTYPE 并移除脚本、`foreignObject`、SMIL 动画、事件属性、`<style>` 与非本地 URL 后以新 `image/svg+xml` Blob 交给 `<img>`；所有图片插件不请求文件内远程 URL。
- **验证状态分离**：相机 RAW 等缺少可再分发型号语料的格式，可按实际能力在 Manifest 中声明并标记对应验证状态，不把缺样例等同于不支持。

## 2. 当前支持矩阵

| 格式族 | 扩展名 | 插件 | 等级 | 状态 | 能力范围与主要预算 |
|---|---|---|---:|---|---|
| JPEG / PNG / APNG / GIF / WebP / AVIF | `.jpg` `.png` `.apng` `.gif` `.webp` `.avif` 等 | `browser-image` | 3–4 | verified | 原生 `<img>`（probe ≤1 MiB）；GIF/APNG/动画 WebP/AVIF 按需启用 ImageDecoder 帧控制（128 MiB / 8192 边 / 16 Mi 单帧 / 64 Mi 总像素 / 1 万帧）；`.heif`/`.heifs`/`.hif` 仅接受 `avif`/`avis` brand |
| BMP / ICO / CUR | `.bmp` `.dib` `.ico` `.cur` | `browser-image` | 3 | verified | 原生 `<img>` 解码，不提供 ICO 多尺寸导航 |
| SVG / SVGZ | `.svg` `.svgz` | `safe-svg` | 3 | implemented | 安全清理后 `<img>` 预览；输入与解压上限 128 MiB、10 万元素；代码查看器保留源码检查 |
| TGA / Netpbm | `.tga` `.icb` `.vda` `.vst` `.pnm` `.pbm` `.pgm` `.ppm` `.pam` | `general-raster` | 4 | verified | Worker 解码；输入 ≤256 MiB、单页 ≤64 Mi 像素、Canvas 单边 ≤8192 px |
| TIFF / BigTIFF / Pyramidal / OME-TIFF | `.tif` `.tiff` `.tf8` `.btf` `.btiff` `.ptif` `.ome.tif` 等 | `general-raster` | 3–4 | verified / implemented | `geotiff@3.0.5` 分片读取，≤1024 页 / 64 Mi 像素；带 ICC 标注未应用（等级 3）；BigTIFF 完整大文件回归与 OME Z/C/T 维度待补 |
| GeoTIFF / COG | `.gtif` `.gtiff` `.geotif` `.geotiff` | `general-raster` | 3 | implemented | 按普通 TIFF 查看像素/页面，检测到空间标签时提示未解释 CRS/坐标/波段 |
| OpenEXR / Radiance HDR | `.exr` `.hdr` `.rgbe` | `hdr-image` | 4 | implemented | 纯 TS Worker 解码线性 Float32；OpenEXR 支持扫描线/分块/多 Part、多通道 AOV、None/RLE/ZIPS/ZIP/PIZ/PXR24/B44(A)；支持实时曝光/Gamma/ACES 等色调映射、悬停线性像素读数与 360° WebGL 环境球预览；≤256 MiB / ≤32 Mi 像素；不含 DWAA/DWAB 与 Deep Data |
| JPEG XL | `.jxl` | `modern-raster` | 4 | verified | 原生 ImageDecoder 优先，`jxl-oxide-wasm@0.12.6` Worker 回退；256 MiB / 64 Mi 像素 / 4096 关键帧 |
| HEVC HEIF / HEIC | `.heic` `.heif` `.heifs` `.hif` | `modern-raster` | 3 | implemented | 原生优先，失败回退自建 `libheif 1.23.2-anyfile.1` Worker（见第 3 节）；仅主图，无辅助项/序列导航 |
| 相机 RAW | `.dng` `.cr2` `.cr3` `.nef` `.arw` `.raf` `.orf` `.pef` `.rw2` 等 | `camera-raw` | 2 | verified | `libraw-wasm@1.6.0`（需 COOP/COEP），内嵌缩略图与基础显影；256 MiB / 64 Mi 像素；型号级自动回归待补 |
| PSD / PSB | `.psd` `.psb` | `photoshop` | 3 | implemented | `ag-psd@31.0.2` Worker 解码已保存合成图与图层计数；256 MiB 输入 / 64 Mi 像素 / 256 MiB 解码预算；不支持图层切换或重合成 |
| Pixelmator PXD | `.pxd` | `pixelmator-pxd` | 2 | implemented | 查看包内合成预览与元数据 |
| DICOM | `.dcm` `.dicom` | `dicom` | 1 / 3 | implemented | Part 10 原生 8/16-bit 灰度、8-bit RGB、多帧与窗宽窗位；压缩传输语法/LUT 仅元数据 |
| 全景照片 | DJI OQ001 `.jpg` / GoPro MAX `.jpg` / Insta360 `.insp` `.dng` | `dji-osmo` / `gopro-max` / `insta360` | 3–5 | verified / implemented | 按机型与元数据精确 probe，WebGL 球面查看 |

## 3. HEIC / HEIF 安全与许可记录

- **拒绝 npm 预编译包**：`libheif-js@1.19.8` 与 `@discourse/heic@1.0.0`（锁定 `libheif 1.19.7`）缺少 `libheif 1.23.2` 的高危安全修复，且 npm 声明的 Apache-2.0 不能覆盖内嵌 LGPL-3.0 义务。
- **当前自建方案**：`libheif 1.23.2 + libde265 1.1.1`（`1.23.2-anyfile.1`，源码配方见 `tools/`），独立 Worker 输出 straight-alpha RGBA8。除 128 MiB 输入与 64 Mi 像素限制外，libheif 内部硬限 **256 items、4096 tiles、384 MiB 内存预算**。
- **HEVC 专利决定**：已审阅 Access Advance HEVC 许可材料并接受本地浏览器解码器分发风险；该结论**仅限本地浏览器解码器分发**，不得外推至其他编码或分发模式。

## 4. 未实现候选

- **分层设计图**：OpenRaster (`.ora`)、Krita (`.kra`)、GIMP (`.xcf`)；大 PSB 分块读取与 PSD 图层树展示。
- **GPU 纹理**：`.dds`、`.ktx` / `.ktx2`（Basis/Khronos WASM，mipmap/cubemap/通道检查）。
- **科学/体数据与专业格式**：专用 GeoTIFF/COG（等级 5 空间交互）、NIfTI (`.nii`/`.nii.gz`)、NRRD (`.nrrd`)、FITS (`.fits`)、PFM、JPEG 2000 (`.jp2`/`.j2k`)、WMF/EMF、ICNS/ANI、PCX/DCX。
