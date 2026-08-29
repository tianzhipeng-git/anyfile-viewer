# 通用栅格图片查看器

## 基本介绍

支持 TGA、Netpbm（PBM/PGM/PPM/PAM）及已验证子集的 TIFF/BigTIFF，提供分页、缩放、旋转和适应窗口查看。

## 实现原理

probe 最多读取前 1 MiB 识别格式。解码在专用 Worker 中完成，非预乘 RGBA8 缓冲通过 transferable 传回主线程，再由响应 DPR 和容器尺寸的 Canvas 2D 视口显示。TGA/Netpbm 使用内置解码器；TIFF 通过 `fromBlob()` 分片读取，并在 Worker 中应用方向。

## 依赖

`geotiff@3.0.5` 负责 TIFF/BigTIFF 解析与解码，采用 MIT 许可证，运行时不使用 CDN 或额外 WASM 资产；内部依赖 `@anyfile/viewer-protocol` 和 `@anyfile/viewer-rendering`。

## 已知限制

- TGA/Netpbm 需完整读入，输入最大 256 MiB；单页最大 64 Mi 像素，TIFF 最多 1024 页。
- TIFF 支持 unsigned 1–16 bit、strip/tile、多页及 None、LZW、Deflate、PackBits、JPEG 等常见压缩；未由真实样例覆盖的压缩变体和 tiled JPEG 兼容性不作完整保证。
- TIFF ICC profile 仅识别、不转换；GeoTIFF 和 OME-TIFF 只显示普通像素与分页，不解释地理坐标或 OME-XML 维度语义。
- BigTIFF 使用与 TIFF 相同的能力分级；存在 ICC/GeoTIFF 标签、布局不确定或实验性压缩等实际能力缺失时，probe 返回主要内容等级 3。固定样例覆盖度单独记录为验证状态，不参与运行时等级判断。
