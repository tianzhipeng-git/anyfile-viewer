import { defineFormat } from "./define-format";

export const tgaFormat = defineFormat(
  "tga",
  "images-video",
  4,
  { name: "TGA image", title: "Open TGA Images Online", description: "Decode Targa images and common run-length variants locally.", introduction: "TGA is a simple raster format used by older graphics tools, games and texture pipelines. Anyfile parses its header, palette and pixel orientation before rendering supported raw or RLE pixels.", canShow: ["True-color, grayscale and indexed pixels","Raw and run-length encoded images"], limitations: ["Developer-specific extension areas are not fully interpreted","Malformed RLE streams are rejected"], faq: [{ question: "Why can a TGA appear upside down elsewhere?", answer: "TGA stores an origin flag; Anyfile applies it when arranging decoded rows." }] },
  { name: "TGA 图片", title: "在线打开 TGA 图片", description: "在本地解码 Targa 图片与常见游程压缩变体。", introduction: "TGA 是旧图形工具、游戏与纹理管线常用的简单栅格格式。Anyfile 解析文件头、调色板和像素方向，再渲染受支持的原始或 RLE 像素。", canShow: ["真彩色、灰度与索引像素","原始与游程编码图片"], limitations: ["不会完整解释开发者专用扩展区","损坏的 RLE 数据会被拒绝"], faq: [{ question: "为什么 TGA 在其他工具里可能上下颠倒？", answer: "TGA 保存原点标志；Anyfile 会据此排列解码后的像素行。" }] },
  {},
  undefined,
  ["icb","vda","vst"],
);

