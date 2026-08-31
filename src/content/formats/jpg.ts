import { defineFormat } from "./define-format";

export const jpgFormat = defineFormat(
  "jpg",
  "images-video",
  4,
  { name: "JPEG image", title: "Open JPEG Images Online", description: "View locally decoded JPEG photographs without uploading.", introduction: "JPEG uses lossy compression optimized for photographs. Anyfile verifies the selected image with the browser decoder and displays its pixels in the shared zoomable viewport.", canShow: ["Decoded photograph pixels","Image dimensions and browser color handling"], limitations: ["CMYK and unusual JPEG profiles vary by browser","The viewer does not expose every EXIF field"], faq: [{ question: "Can Anyfile open a CMYK JPEG?", answer: "Only when the current browser can decode it; color appearance may differ from print software." }] },
  { name: "JPEG 图片", title: "在线打开 JPEG 图片", description: "无需上传，在本地查看浏览器解码的 JPEG 照片。", introduction: "JPEG 使用针对照片优化的有损压缩。Anyfile 通过浏览器解码器验证所选图片，并在可缩放的共享视口中显示像素。", canShow: ["解码后的照片像素","图片尺寸与浏览器色彩处理"], limitations: ["CMYK 与少见 JPEG 配置的表现取决于浏览器","不会展示每一项 EXIF 字段"], faq: [{ question: "Anyfile 能打开 CMYK JPEG 吗？", answer: "仅在当前浏览器能够解码时可以；颜色外观可能与印刷软件不同。" }] },
  {},
  undefined,
  ["jpeg","jpe","jfif","jif","jfi","pjpeg","pjp"],
);

