import { archiveInspectionCapability, libreOfficeAlternative } from "./archive-shared";
import { defineFormat } from "./define-format";

export const odgFormat = defineFormat("odg", "documents", 2,
  { name: "OpenDocument drawing", title: "Inspect ODG Drawing Packages Online", description: "Browse OpenDocument drawing package entries locally.", introduction: "ODG stores vector drawings, styles and embedded images in an OpenDocument ZIP package. Anyfile lists the internal files and their sizes but does not reconstruct the drawing canvas.", canShow: ["Drawing XML, styles and embedded-image paths", "Package entry sizes and compression"], limitations: ["Shapes, layers, text flow and page layout are not rendered", "External and encrypted resources are not loaded"], faq: [{ question: "Can Anyfile display the actual ODG drawing?", answer: "Not yet. It currently inspects the package structure rather than interpreting OpenDocument drawing geometry." }] },
  { name: "OpenDocument 绘图", title: "在线检查 ODG 绘图软件包", description: "在本地浏览 OpenDocument 绘图软件包条目。", introduction: "ODG 在 OpenDocument ZIP 软件包中保存矢量绘图、样式与内嵌图片。Anyfile 列出内部文件及大小，但不重建绘图画布。", canShow: ["绘图 XML、样式与内嵌图片路径", "软件包条目大小与压缩"], limitations: ["不渲染形状、图层、文字流与页面布局", "不加载外部与加密资源"], faq: [{ question: "Anyfile 能显示实际 ODG 绘图吗？", answer: "暂时不能。当前检查软件包结构，而不解释 OpenDocument 绘图几何。" }] },
  archiveInspectionCapability, libreOfficeAlternative);
