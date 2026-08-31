import { defineFormat } from "./define-format";

export const pnmFormat = defineFormat(
  "pnm",
  "images-video",
  4,
  { name: "Netpbm image", title: "Open PNM, PBM, PGM and PPM Images Online", description: "Read Netpbm bitmap, grayscale and pixmap files locally.", introduction: "The Netpbm family uses compact headers followed by text or binary samples. Anyfile distinguishes PBM, PGM, PPM and PAM variants, validates their sample ranges and renders the resulting raster.", canShow: ["Bitmap, grayscale, RGB and PAM channel data","ASCII and binary Netpbm encodings"], limitations: ["Comments are parsed but not presented as metadata","Huge ASCII rasters can be slow to parse"], faq: [{ question: "Is PNM one exact pixel format?", answer: "No. It is a family name covering PBM, PGM, PPM and PAM variants with different channels and sample depths." }] },
  { name: "Netpbm 图片", title: "在线打开 PNM、PBM、PGM 与 PPM 图片", description: "在本地读取 Netpbm 位图、灰度图和彩色图。", introduction: "Netpbm 家族使用简短文件头加文本或二进制采样。Anyfile 区分 PBM、PGM、PPM 与 PAM 变体，校验采样范围并渲染栅格。", canShow: ["位图、灰度、RGB 与 PAM 通道数据","ASCII 与二进制 Netpbm 编码"], limitations: ["注释会被解析，但不作为元数据展示","超大 ASCII 栅格解析可能较慢"], faq: [{ question: "PNM 是一种确定的像素格式吗？", answer: "不是。它是 PBM、PGM、PPM 与 PAM 等不同通道和采样深度变体的家族名称。" }] },
  {},
  undefined,
  ["pbm","pgm","ppm","pam"],
);

