# General raster viewer

阶段 2 的自定义栅格插件，支持 TGA、Netpbm（PBM/PGM/PPM/PAM）和已验证子集的 TIFF/BigTIFF。解码在专用 Worker 中执行，RGBA8 非预乘缓冲通过 transferable 交给主线程，并由响应 DPR/resize 的 Canvas 2D 视口显示。

## 声明范围

- TGA：未压缩/RLE，灰度、真彩色和调色板，15/16/24/32 bit，并应用四种 origin；同时接收结构相同的 `.icb`、`.vda`、`.vst` 别名。
- Netpbm：P1–P7，文本/二进制，1/8/16 bit，PAM 的灰度、RGB 和 alpha tuple。
- TIFF/BigTIFF：unsigned 1–16 bit，strip/tile，多页，常见 photometric；除 `.tif`/`.tiff` 外，也接收 BigTIFF、金字塔 TIFF、GeoTIFF 和 OME-TIFF 的常用扩展名。固定样例验证 None、LZW、Deflate、PackBits 和 JPEG。`geotiff@3.0.5` 还能解码 LERC、Zstandard 与 WebP，但在补充真实样例前 probe 保守返回等级 3；已知存在兼容性缺口的 tiled JPEG 同样返回等级 3。
- TIFF orientation 在 Worker 中应用一次。alpha 输出为 RGBA8、非预乘。
- TIFF ICC profile 只识别而不转换；此类文件 probe 返回等级 3，UI 明确显示“ICC 未应用”。有真实样例覆盖且无 ICC 的已支持 classic TIFF 返回等级 4；BigTIFF 目前只有合成头证据，因此保守返回等级 3。
- GeoTIFF 和 OME-TIFF 当前复用普通 TIFF 像素/分页预览，不解释坐标参考、空间变换或 OME-XML 维度语义；检测到 GeoTIFF 标签时 probe 返回等级 3。

## 资源与生命周期

- probe 最多读取前 1 MiB，不导入 decoder、Worker、Canvas 或 `geotiff`。
- TGA/Netpbm 需要完整输入，限制为 256 MiB；TIFF 使用 `fromBlob()` 分片读取，不复制完整编码文件。
- 单页最多 64 Mi 像素，TIFF 最多 1024 页；所有尺寸乘法在分配前检查。
- 宿主取消时终止 Worker；结果像素缓冲使用 transferable；Canvas 的 animation frame、ResizeObserver、事件和 ImageBitmap 均由幂等 `dispose()` 清理。
- Canvas backing store 跟随 DPR 与容器 resize，并把单边限制在 8192 物理像素，避免超大屏幕或异常 DPR 造成无界分配。

关键第三方依赖为 `geotiff@3.0.5`，MIT 许可证，上游为 <https://github.com/geotiffjs/geotiff.js>。维护状态核对于 2026-08-28：项目仍活跃维护，2026-03 发布稳定版 v3.0.5，随后发布了 v3.1.0 beta；升级时需重新核对 release、已知解码缺口和体积。该依赖无运行时 CDN、额外 WASM 静态资产或文件上传。2026-08-28 的 Turbopack 生产构建中，完整插件入口约 5.6 KiB gzip，Worker 核心约 14.8 KiB gzip，具体压缩 decoder 继续按需拆分。
