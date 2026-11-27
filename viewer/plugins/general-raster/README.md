# 通用栅格图片查看器 (`general-raster`)

## 基本介绍

- **插件 ID**：`general-raster`
- **格式入口**：`.tga`、`.icb`、`.vda`、`.vst`、`.pnm`、`.pbm`、`.pgm`、`.ppm`、`.pam`、`.tif`、`.tiff`、`.tf8`、`.btf`、`.btiff`、`.ptif`、`.ptiff`、`.gtif`、`.gtiff`、`.geotif`、`.geotiff`、`.ome.tif`、`.ome.tiff`、`.ome.tf2`、`.ome.tf8`、`.ome.btf`

支持 TGA、Netpbm（PBM/PGM/PPM/PAM）及已验证子集的 TIFF/BigTIFF，提供分页、缩放、旋转和适应窗口查看。

## 实现原理

probe 最多读取前 1 MiB 识别格式。解码在专用 Worker 中完成，非预乘 RGBA8 缓冲通过 transferable 传回主线程，再由响应 DPR 和容器尺寸的 Canvas 2D 视口显示。TGA/Netpbm 使用内置解码器；TIFF 通过 `fromBlob()` 分片读取，并在 Worker 中应用方向。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/runtime-assets` | 共享 Worker RPC 客户端 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `geotiff@3.0.5` | TIFF/BigTIFF 解析与像素解码 |

`geotiff` 采用 MIT 许可证；运行时不使用 CDN 或额外 WASM 资产。TGA/Netpbm 为项目内解码器。

## Agent extract

`src/extract.ts` 通过 `BinarySource` 范围读取（TIFF 用自定义 geotiff source，不走 `FileReader`）实现 `inspect` / `read` / `renderImage`，geotiff 只在 TIFF 输入时动态加载：

- `inspect`：格式、显示尺寸（已应用 Orientation）、位深、页数、压缩、分块、ICC；GeoTIFF 额外给出 `geo`（GeoKeys、`EPSG:<code>` CRS、原点、分辨率、外包框）。
- `metadata`：全部页面的 Markdown 元数据，TIFF 含逐页 IFD 标签（Make/Model/DateTime/Software 等）；`page:<n>` 只读单页。支持 `filter`，`offset:` / `line:` 游标；strip/tile 偏移等大数组只显示数量。
- `renderImage`：`page:<n>`（缺省第 1 页）复用 `decodeTiffDocument()` / TGA / Netpbm 解码器，沿用 64 Mi 像素和 1024 页上限，再按 `maxDimension` 缩小。

## 已知限制

- TGA/Netpbm 需完整读入，输入最大 256 MiB；单页最大 64 Mi 像素，TIFF 最多 1024 页。
- TIFF 支持 unsigned 1–16 bit、strip/tile、多页及 None、LZW、Deflate、PackBits、JPEG 等常见压缩；未由真实样例覆盖的压缩变体和 tiled JPEG 兼容性不作完整保证。
- TIFF ICC profile 仅识别、不转换；查看器中 GeoTIFF 和 OME-TIFF 只显示普通像素与分页，不解释地理坐标（Agent extract 输出 GeoKeys 与外包框）或 OME-XML 维度语义。
- BigTIFF 使用与 TIFF 相同的能力分级；存在 ICC/GeoTIFF 标签、布局不确定或实验性压缩等实际能力缺失时，probe 返回主要内容等级 3。固定样例覆盖度单独记录为验证状态，不参与运行时等级判断。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/general-raster
```
