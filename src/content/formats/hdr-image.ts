import { defineFormat } from "./define-format";

export const exrFormat = defineFormat(
  "exr",
  "images-video",
  4,
  {
    name: "OpenEXR high dynamic range image",
    title: "Open OpenEXR (.exr) Files Online",
    description: "Inspect multi-channel OpenEXR renders, AOV layers, exposure stops, and 360° HDRI maps locally in your browser.",
    introduction: "OpenEXR stores linear floating-point VFX renders, multi-pass AOVs, and studio lighting maps at 16-bit half or 32-bit float precision. Anyfile decodes scanline, tiled, and multi-part EXR files locally in a Worker while preserving full linear dynamic range for interactive exposure, gamma, tone mapping, and pixel value inspection.",
    canShow: [
      "Multi-channel AOV layers and multi-part EXR switching",
      "Real-time exposure (EV), gamma, ACES/Reinhard/Filmic tone mapping, and false-color EV view",
      "Hover readout of linear Float32 RGBA values and luminance",
      "Interactive 360° equirectangular HDRI sphere preview",
    ],
    limitations: [
      "DWAA/DWAB lossy DCT compression and deep-data EXR parts are not supported",
      "Input is capped at 256 MiB and 32 Mi pixels (up to 8192×4096)",
    ],
    faq: [
      {
        question: "Why do online EXR converters lose highlight detail?",
        answer: "Converting an EXR to 8-bit PNG clips values above 1.0 before you can adjust exposure. Anyfile keeps the active AOV layer in linear 32-bit float so you can dial EV stops up or down without re-decoding.",
      },
      {
        question: "Which OpenEXR compressions are supported?",
        answer: "Uncompressed, RLE, ZIPS, ZIP, PIZ wavelet, PXR24, and B44/B44A scanline and tiled files decode locally in your browser.",
      },
    ],
  },
  {
    name: "OpenEXR 高动态范围图像",
    title: "在线打开 OpenEXR (.exr) 文件",
    description: "无需上传，在浏览器本地查看多通道 OpenEXR 渲染图、AOV 分层、曝光/色调映射与 360° HDRI 环境球。",
    introduction: "OpenEXR 是影视后期、三维渲染与游戏光照管线常用的线性浮点高动态范围图像格式，支持 16 位半精度与 32 位浮点像素。Anyfile 在本地 Worker 中解码扫描线、分块及多 Part EXR 文件，保留完整线性浮点数据以支持实时曝光、Gamma、色调映射与像素数值检查。",
    canShow: [
      "多通道 AOV 分层与多 Part EXR 切换",
      "实时曝光（EV）、Gamma、ACES/Reinhard/Filmic 色调映射与 EV 伪彩色视图",
      "鼠标悬停读取线性 Float32 RGBA 像素值与亮度",
      "交互式 360° 等距柱状 HDRI 环境球预览",
    ],
    limitations: [
      "暂不支持 DWAA/DWAB 有损压缩与 Deep Data 深度像素 EXR",
      "单文件上限 256 MiB，单图解码上限 3200 万像素（支持 8K 8192×4096）",
    ],
    faq: [
      {
        question: "为什么普通在线转换工具会让 EXR 高光过曝？",
        answer: "直接压成 8 位 PNG 会截断超过 1.0 的高亮信息。Anyfile 在浏览器内存中保留当前通道层的 32 位线性浮点像素，可实时调节曝光档位与色调映射而不损失高光细节。",
      },
      {
        question: "支持哪些 OpenEXR 压缩方式？",
        answer: "支持无压缩、RLE、ZIPS、ZIP、PIZ 小波、PXR24 以及 B44/B44A 压缩的扫描线与分块图像。",
      },
    ],
  },
  { possibleLevels: [4] },
);

export const hdrFormat = defineFormat(
  "hdr",
  "images-video",
  4,
  {
    name: "Radiance HDR image",
    title: "Open Radiance HDR (.hdr / .rgbe) Files Online",
    description: "View Radiance RGBE and XYZE .hdr environment maps locally with exposure, tone mapping, and 360° sphere preview.",
    introduction: "Radiance HDR (.hdr / .rgbe) encodes high dynamic range lighting using shared-exponent RGBE or XYZE pixels, widely used for 3D image-based lighting (IBL) and 360° sky domes. Anyfile decodes adaptive and legacy RLE scanlines directly in the browser without sending files to a server.",
    canShow: [
      "Linear Float32 RGBE and XYZE decoding across all scanline orientations",
      "Interactive exposure EV, auto-exposure, gamma, and ACES/Reinhard/Filmic tone mapping",
      "360° WebGL environment sphere navigation for equirectangular HDRI maps",
      "Header metadata and dynamic range luminance statistics",
    ],
    limitations: [
      "Single RGB layer only; Radiance HDR does not store multi-pass AOV channels",
      "Input is capped at 256 MiB and 32 Mi pixels",
    ],
    faq: [
      {
        question: "Can I preview a 360° HDRI sky dome from a .hdr file?",
        answer: "Yes. Switch the toolbar toggle from 2D to 360° HDRI to drag around the environment sphere and zoom FOV while adjusting exposure and tone mapping live.",
      },
    ],
  },
  {
    name: "Radiance HDR 图像",
    title: "在线打开 Radiance HDR (.hdr / .rgbe) 文件",
    description: "本地查看 Radiance RGBE / XYZE 高动态范围环境贴图，支持曝光调节、色调映射与 360° 环境球预览。",
    introduction: "Radiance HDR（.hdr / .rgbe）采用共享指数编码高动态范围光照信息，广泛用于三维基于图像的照明（IBL）与 360° 天空环境贴图。Anyfile 在浏览器本地解码自适应与传统 RLE 扫描线，无需上传文件。",
    canShow: [
      "支持 RGBE 与 XYZE 线性浮点解码及各种扫描线方向",
      "实时曝光 EV、自动曝光、Gamma 与 ACES/Reinhard/Filmic 色调映射",
      "面向等距柱状 HDRI 贴图的 360° WebGL 环境球交互预览",
      "文件头元数据与动态范围亮度统计",
    ],
    limitations: [
      "Radiance HDR 格式本身仅包含单一 RGB 层，不含多通道 AOV",
      "单文件上限 256 MiB，单图解码上限 3200 万像素",
    ],
    faq: [
      {
        question: "可以直接预览 .hdr 格式的 360° 环境球吗？",
        answer: "可以。点击工具栏中的“360° 环境球”即可拖拽环顾环境贴图、滚轮缩放视野角度，并实时联动曝光与色调映射参数。",
      },
    ],
  },
  { possibleLevels: [4] },
  undefined,
  ["rgbe"],
);
