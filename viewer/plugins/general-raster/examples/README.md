# 测试样例清单

样例由 `node viewer/plugins/general-raster/scripts/generate-examples.mjs` 使用 ImageMagick 从程序生成的渐变创建，不含第三方版权素材。

| 格式 | 正常样例 | 异常样例 |
|---|---|---|
| TGA | `sample.tga`、`sample-rle.tga` | `truncated-sample.tga`、`corrupt.tga` |
| PBM/PGM/PPM/PAM | `sample-ascii.pbm`、`sample-ascii.pgm`、`sample-ascii.ppm`（P1–P3）、`sample.pbm`、`sample.pgm`、`sample.ppm`（P4–P6）、`sample.pam`、`sample-alpha.pam`（P7） | `truncated-sample.ppm`、`corrupt.ppm` |
| TIFF | `sample-none.tiff`、`sample-lzw.tiff`、`sample-deflate.tiff`、`sample-packbits.tiff`、`sample-jpeg.tiff`、`sample-tiled.tiff`、`sample-multipage.tiff`、`sample-16bit.tiff`、`sample-alpha.tiff`、`sample-oriented.tiff`、`sample-geotiff.tiff` | `truncated-sample-lzw.tiff`、`corrupt.tiff` |

`sample-geotiff.tiff` 由同一脚本用 geotiff 的 `writeArrayBuffer()` 写出（32×16，EPSG:4326，原点 116,40，像素 0.5°）。TIFF 样例覆盖 strip/tile、多页、8/16 bit、alpha、orientation 以及 None、LZW、Deflate、PackBits、JPEG 压缩。BigTIFF 的 64-bit IFD 识别由合成头测试覆盖，避免提交人为膨胀的二进制。
