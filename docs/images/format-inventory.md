# 图片与图像型格式清单

- 状态：候选 inventory，不是承诺或开发排期
- 用途：帮助判断内容模型、插件归属和支持等级

## 1. 纳入原则

本清单收录满足至少一项的格式：

- 主要用途是保存二维图片、动画、多页图片或图层文档；
- 保存相机 RAW、科学/医学图像或体数据；
- 保存 GPU 可以显示的纹理；
- 对图片查看器具有明确的预览价值。

清单中的格式不自动进入 roadmap。实际支持状态只看 [support-matrix.md](support-matrix.md)。

## 2. 浏览器与通用栅格

| 家族 | 格式/扩展名 | 内容模型 | 备注 |
|---|---|---|---|
| Web 常见 | JPEG/JPG/JFIF | 单帧栅格 | baseline、progressive 等子类型需测试 |
| Web 常见 | PNG/APNG | 单帧或帧序列 | APNG 常与 PNG 共用 `.png` |
| Web 常见 | GIF87a/GIF89a | 单帧或帧序列 | palette、透明索引、帧处置 |
| Web 常见 | WebP | 单帧或帧序列 | 有损、无损、alpha、动画 |
| Web 常见 | AVIF | 单帧或帧序列 | 高 bit-depth、HDR 能力需要运行时验证 |
| Windows | BMP/DIB | 单帧栅格 | 多 header 版本、palette、bitfield、RLE |
| 传统栅格 | TGA/TARGA | 单帧栅格 | raw/RLE、palette、origin |
| 传统栅格 | PCX/DCX | 单帧或多页 | DCX 是多页 PCX 容器 |
| Netpbm | PBM/PGM/PPM/PAM/PNM | 单帧栅格 | 文本/二进制、高 bit-depth 变体 |
| Unix/X11 | XBM/XPM | 单帧栅格/源码表示 | 需要主动内容和解析边界评审 |
| Apple legacy | PICT/MacPaint | 单帧或绘图指令 | 历史格式，近期价值较低 |

## 3. TIFF 与相关家族

| 格式 | 内容模型 | 关键差异 |
|---|---|---|
| TIFF | 单帧、多页或 tile | 多种 photometric、compression、bit depth、ICC |
| BigTIFF | 同 TIFF | 64-bit offset，面向超大文件 |
| GeoTIFF | 地理栅格 | TIFF tags + 地理参考、band、nodata |
| COG | tile/金字塔 | 为 range request/按需读取组织的 GeoTIFF |
| TIFF/EP | 摄影图像/RAW 基础 | DNG 等格式的历史基础之一 |
| SVS/OME-TIFF 等 | 金字塔/科学图像 | 领域约定，不能只按普通 TIFF 宣称支持 |

TIFF 是容器家族，不是“实现一个 LZW decoder 就完成支持”。支持矩阵必须逐项声明 compression、photometric、page 和 tile 能力。

## 4. JPEG 标准家族

| 格式 | 内容模型 | 备注 |
|---|---|---|
| JPEG | 单帧栅格 | 常见浏览器原生格式 |
| Lossless JPEG | 单帧栅格 | 与常见 baseline/progressive 能力分开记录 |
| JPEG-LS | 单帧/医学像素数据 | 常见于特定专业场景 |
| JPEG 2000 / J2K/J2C/JP2 | 单帧、tile | codestream 与 JP2 family 容器需区分 |
| JPEG XR/JXR/WDP | 单帧栅格 | 旧式高 bit-depth 格式 |
| JPEG XL/JXL | 单帧或动画 | 原生解码与 WASM 回退需单独评估 |
| JPEG XS | 专业低延迟编码 | 不属于近期普通图片预览目标 |

“JPEG 家族”不是一个共享 decoder 的同义词。

## 5. HEIF 家族与现代容器

| 格式 | 内容模型 | 备注 |
|---|---|---|
| HEIF | 单图、序列、派生图像、辅助图像 | ISO Base Media File Format 家族 |
| HEIC | 常见 HEIF 文件命名 | 常使用 HEVC，但必须检查内部 item/codec |
| AVIF | 单图或序列 | 常使用 AV1 图像编码 |

需要区分 primary item、thumbnail、alpha/depth auxiliary item、grid 和 image sequence。

## 6. HDR 与高精度栅格

| 格式 | 内容模型 | 备注 |
|---|---|---|
| OpenEXR/EXR | 多 channel、高动态范围、tile | channel、part、compression 和 deep data |
| Radiance HDR/RGBE | HDR 栅格 | 需要显示 tone mapping |
| PFM | float 栅格 | 简单但不是普通 sRGB 图片 |
| Cineon | 胶片扫描栅格 | 电影/后期领域色彩语义 |
| DPX | 图像序列帧 | 高 bit-depth、电影/广播元数据 |

这些格式的“能生成 8-bit 预览”与“色彩正确”是不同支持等级。

## 7. 图标与光标

| 格式 | 内容模型 | 备注 |
|---|---|---|
| ICO | 多尺寸/多 bit-depth 图像集 | 内部可能是 BMP 或 PNG |
| CUR | 图像集 + hotspot | 光标语义 |
| ANI | 动画光标 | RIFF 容器、帧和时序 |
| ICNS | 多尺寸图像集 | 多种历史与现代编码 |

查看器需要允许用户选择 size/frame，而不是只显示第一个图像。

## 8. 相机 RAW

| 类型 | 格式示例 |
|---|---|
| 开放/跨厂商 | DNG |
| Canon | CRW、CR2、CR3 |
| Nikon | NEF、NRW |
| Sony | ARW、SRF、SR2 |
| Fujifilm | RAF |
| OM/Olympus | ORF |
| Panasonic | RW2 |
| Pentax | PEF、PTX |
| 其他厂商 | SRW、RWL、3FR、IIQ、X3F、DCR、KDC、DCS |

厂商扩展名不代表单一稳定版本。格式可以在解码路径和有界格式识别已经实现后先进入 Manifest，并以 `implemented` 或待验证状态交付；缺少固定样例本身不等于不支持。真实相机样例、人工验收或可再生成测试用于记录已覆盖的型号和子格式、决定是否标记为 `verified`，发现实际能力缺失时再降低对应文件的支持等级。内嵌预览和完整 RAW 显影分开计级。

## 9. 图层与编辑工程文件

| 格式 | 内容模型 | 首选预览策略 |
|---|---|---|
| PSD/PSB | 图层文档 | 合成图 + 图层元数据，再评估完整合成 |
| ORA/OpenRaster | ZIP 图层文档 | `mergedimage.png` + stack 元数据 |
| KRA | ZIP 工程文档 | 合成预览 + 图层元数据 |
| XCF | GIMP 图层文档 | 合成预览或按需解析 |
| CLIP/SAI/CPT/Affinity | 私有/半私有工程文档 | 先评估规范、样例与依赖 |

编辑器功能、滤镜、字体、插件效果和颜色管理可能无法被第三方完整复现。支持文案必须说明扁平预览与分层还原的区别。

## 10. 矢量与页面描述

| 格式 | 归属判断 |
|---|---|
| SVG/SVGZ | 图片范围，但需要独立安全策略 |
| WMF/EMF/EMF+ | 可视为 legacy vector image，单独评估 renderer |
| EPS/PS | 页面描述语言，优先归页面/文档查看器 |
| PDF | 已有独立 PDF 插件，不进入图片 backlog |
| AI/CDR | 专业设计文档，不等同于普通图片 |
| DXF/DWG/CGM | CAD/工程插件范围 |
| SWF/VML | 主动内容或历史 Web 格式，不进入近期图片计划 |

文件包含图形不代表应由图片插件处理。

## 11. 科学、地理与医学

| 领域 | 格式示例 | 内容模型 |
|---|---|---|
| 医学实例/序列 | DICOM | 多 transfer syntax、元数据、二维/多帧/序列 |
| 神经影像/体数据 | NIfTI、Analyze、NRRD、MINC | 三维/四维标量或标签数据 |
| 天文 | FITS | 多 HDU、图像数组和表格 |
| 地理/遥感 | GeoTIFF、COG、ECW、MrSID、ERDAS IMG | 多 band、金字塔、地理参考 |
| 通用科学容器 | HDF5、NetCDF | 不一定是图像，需数据集语义和专用 adapter |

专业格式优先评估领域库，不自行重写 transfer syntax、投影、体渲染或 deep zoom 基础设施。

## 12. GPU 纹理

| 格式 | 内容模型 | 备注 |
|---|---|---|
| DDS | texture set | BC family、mip、cubemap、array |
| KTX/KTX2 | texture set | 多种 GPU format 和 supercompression |
| Basis Universal | 中间纹理编码 | ETC1S/UASTC，通常需要运行时转码 |
| PVR | texture set | PVRTC 等移动 GPU 格式 |
| ASTC/PKM 等 | 压缩纹理数据 | 可能缺少完整容器元数据 |

纹理查看器需要 channel、face、layer、mip 和颜色/法线解释，不能只把第一级纹理转成 PNG。

## 13. 明确排除出图片 backlog 的类别

- 视频容器：MP4、MOV、MKV、AVI、WebM、MXF 等；
- 视频 codec：H.264、HEVC、AV1 Video、VP9、ProRes、DNx 等；
- 流媒体协议：HLS、DASH、RTMP、WebRTC；
- 光盘和广播体系：DVD、Blu-ray、DVB、ATSC 等；
- 通用归档/压缩：ZIP、Deflate、Zstd、LZ4 等；
- 3D/CAD/页面文档：由对应领域插件处理。

这些技术可能被某个图片容器复用，但不因此成为图片文件格式。

## 14. 参考资料

- [MDN: Image file type and format guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)
- [WebCodecs specification](https://www.w3.org/TR/webcodecs/)
- [Adobe Photoshop File Formats Specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/)
- [GeoTIFF.js](https://geotiffjs.github.io/)
- [Cornerstone3D Image Loaders](https://www.cornerstonejs.org/docs/concepts/cornerstone-core/imageloader/)
- [NiiVue](https://github.com/niivue/niivue)
- [ITK-Wasm](https://docs.itk.org/projects/wasm/en/latest/)
- [Khronos KTX-Software](https://github.com/KhronosGroup/KTX-Software)
