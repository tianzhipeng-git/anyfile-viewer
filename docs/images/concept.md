# 图片查看相关概念

本文统一图片查看文档中的术语。分类服务于实现边界，不试图建立完整的图形学百科。

## 1. 文件、容器与编码

### 文件格式 / 容器格式

规定文件如何组织：文件头、元数据、一个或多个图像项、缩略图、ICC、EXIF、帧、tile、图层或关联资源放在哪里。

示例：TIFF、HEIF、AVIF、PSD、DICOM、KTX2。

容器不一定只对应一种编码。TIFF、HEIF、DICOM 等都可能封装不同的压缩或像素表示。

### Codec / 编解码器

规定编码数据如何压缩和还原。一个 codec 可能被多个容器复用，也可能存在多个 profile、bit depth 或实现限制。

示例：JPEG、JPEG 2000、AV1、HEVC、BC7。

“浏览器存在 WebCodecs API”不等于浏览器支持任意 codec。WebCodecs 规范不要求用户代理实现特定 codec，因此必须做运行时能力验证。

### 压缩算法

比图像 codec 更基础的数据压缩方法，可能用于像素、元数据或容器内部块。

示例：Deflate、LZW、Zstandard、RLE。

RLE 本身不是一个可注册的图片文件格式。

## 2. 解码后的数据

### 像素格式

描述样本在内存中的排列和语义，例如：

- RGB8、RGBA8；
- 灰度 8/16 bit；
- YUV 4:2:0；
- 16-bit float RGBA；
- indexed color + palette；
- premultiplied / unpremultiplied alpha。

像素格式不等于色彩空间。两个缓冲区都可能是 RGB8，但一个是 sRGB，另一个是 Display-P3。

### Pixel Buffer

一块已经展开的像素内存。它适合普通栅格帧，却不是所有图像型文件的共同终点：矢量、图层文档、体数据、GPU 压缩纹理和 tile 金字塔不应被迫立即完整展开。

### ImageBitmap / VideoFrame / CanvasImageSource

浏览器可直接参与绘制的对象。它们是实现手段，不是项目公共协议，也不保证保留源文件全部元数据和领域语义。

## 3. 内容模型

项目使用“内容模型”描述插件真正要展示的数据：

| 内容模型 | 典型格式 | 核心能力 |
|---|---|---|
| 单帧栅格 | JPEG、PNG、TGA | 一张二维图片 |
| 帧序列 | GIF、APNG、Animated WebP | 帧时长、循环、帧处置 |
| 多页图片 | TIFF、DCX | 页选择和按页解码 |
| Tile / 金字塔 | TIFF、COG、SVS | 区域、层级和按需读取 |
| 相机 RAW | DNG、CR3、NEF、ARW | CFA、去马赛克、白平衡、相机色彩 |
| 图层文档 | PSD、PSB、ORA、KRA | 图层、蒙版、混合和合成预览 |
| 矢量场景 | SVG、WMF、EMF | 图元、字体、变换和安全渲染 |
| 科学标量图像 | FITS、部分 HDF5/NetCDF | 数值范围、colormap、切片 |
| 医学体数据 | DICOM、NIfTI、NRRD | window/level、序列、方位和体渲染 |
| GPU 纹理集 | DDS、KTX2 | mip、array、cubemap、GPU 格式 |

这些模型之间可以共享 UI 和视口能力，但不共享一个万能文档对象。

## 4. 颜色与数值映射

### 色彩空间与 ICC

色彩空间描述数值如何对应实际颜色；ICC profile 提供设备或颜色空间间的转换信息。自定义 decoder 输出像素时，必须明确输出色彩空间、bit depth、alpha 和是否已经应用 profile，避免重复转换。

### Orientation

EXIF/TIFF orientation 是显示变换，不应简单地当作 decoder 已经修改了像素。插件必须明确由浏览器、decoder 还是 renderer 应用方向，避免旋转两次。

### Tone mapping

HDR 或高 bit-depth 数据映射到当前显示设备范围的过程。它不是普通 ICC 转换的同义词。

### Window / level 与 colormap

医学和科学数据常保存标量值。显示前需要选择数值窗口，再映射到灰度或颜色。这是领域可视化，不应放进通用“色彩管理”步骤。

## 5. 容易混淆的边界

- AVIF 是基于 ISO Base Media File Format 的图像文件格式，常使用 AV1 图像编码；AV1 本身是 codec。
- HEIF 是容器/文件格式家族；HEIC 常表示使用 HEVC 编码的 HEIF 文件，但扩展名不足以证明内部编码。
- WebP 是 RIFF 基础上的图片格式，内部包含有损、无损、alpha 和动画结构。
- DICOM 不只是“医学图片编码”，它同时包含患者/检查元数据、实例组织和多种 transfer syntax。
- HDF5、NetCDF 是通用科学数据容器；只有数据集具有可视化语义时才属于图像查看范围。
- PDF、CAD、视频和流媒体虽然可能包含图像或产生画面，但不归入图片插件 backlog；它们应由各自领域插件处理。

## 6. 参考资料

- [MDN: Image file type and format guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)
- [W3C: WebCodecs](https://www.w3.org/TR/webcodecs/)
- [RFC 9649: WebP Image Format](https://www.rfc-editor.org/rfc/rfc9649.html)
- [Adobe Photoshop File Formats Specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/)
