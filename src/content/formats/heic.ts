import { defineFormat } from "./define-format";

export const heicFormat = defineFormat(
  "heic",
  "images-video",
  3,
  { name: "HEIC image", title: "Open HEIC and HEIF Images Online", description: "Decode HEIC photos locally with native or WebAssembly support.", introduction: "HEIC commonly stores phone photos in a HEIF container using HEVC compression. Anyfile tries a real native decode first, then loads its local HEIF decoder when the file and browser require it.", canShow: ["Decoded primary image","Dimensions and supported image sequences"], limitations: ["Auxiliary depth images and edits are not reconstructed","Large images depend on browser and WebAssembly memory"], faq: [{ question: "Why does HEIC support vary?", answer: "The container can hold different codecs and auxiliary items; Anyfile currently focuses on supported HEVC primary images." }] },
  { name: "HEIC 图片", title: "在线打开 HEIC 与 HEIF 图片", description: "通过原生或 WebAssembly 能力在本地解码 HEIC 照片。", introduction: "HEIC 通常在 HEIF 容器中使用 HEVC 压缩保存手机照片。Anyfile 先执行真实原生解码，文件或浏览器需要时再加载本地 HEIF 解码器。", canShow: ["解码后的主图片","尺寸与受支持的图像序列"], limitations: ["不会重建辅助深度图与编辑效果","大图片受浏览器和 WebAssembly 内存限制"], faq: [{ question: "为什么 HEIC 支持会有差异？", answer: "容器可包含不同 codec 与辅助项；Anyfile 当前聚焦受支持的 HEVC 主图片。" }] },
  { possibleLevels: [2,3,4] },
  undefined,
  ["heif","heifs","hif"],
);

