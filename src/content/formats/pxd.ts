import { defineFormat } from "./define-format";

export const pxdFormat = defineFormat("pxd", "images-video", 2,
  {
    name: "Pixelmator Pro document",
    title: "Open Pixelmator Pro PXD Files Online",
    description: "Preview the flattened Quick Look image embedded in a Pixelmator Pro document locally.",
    introduction: "PXD is Pixelmator Pro's layered, nondestructive working format. Anyfile validates the ZIP-based document structure and SQLite metadata, then extracts the embedded Quick Look image for a fast local preview without uploading the project.",
    canShow: ["Embedded flattened document preview", "Preview dimensions and image format", "Pan, zoom and rotation controls"],
    limitations: ["Layers, masks, effects and editable text are not reconstructed", "Documents without a supported embedded Quick Look preview cannot be displayed"],
    faq: [{ question: "Can Anyfile display individual PXD layers?", answer: "No. PXD internals are proprietary, so Anyfile shows the flattened Quick Look preview stored by Pixelmator Pro. Open the document in Pixelmator Pro to inspect or edit its layers." }],
  },
  {
    name: "Pixelmator Pro 文档",
    title: "在线打开 Pixelmator Pro PXD 文件",
    description: "在本地预览 Pixelmator Pro 文档内嵌的扁平化 Quick Look 图像。",
    introduction: "PXD 是 Pixelmator Pro 的分层非破坏性工作格式。Anyfile 会校验其 ZIP 文档结构与 SQLite 元数据，再提取内嵌 Quick Look 图像进行快速本地预览，全程不上传项目文件。",
    canShow: ["内嵌的扁平化文档预览", "预览尺寸与图片格式", "平移、缩放与旋转控制"],
    limitations: ["不会重建图层、蒙版、效果或可编辑文字", "缺少受支持的内嵌 Quick Look 预览时无法显示"],
    faq: [{ question: "Anyfile 能否显示单独的 PXD 图层？", answer: "不能。PXD 内部格式是专有格式，因此 Anyfile 展示 Pixelmator Pro 保存的扁平化 Quick Look 预览；如需检查或编辑图层，请使用 Pixelmator Pro。" }],
  },
  { possibleLevels: [2], verification: "verified" },
  [{
    name: "Pixelmator Pro",
    url: "https://support.apple.com/guide/pixelmator-pro/about-the-pixelmator-pro-file-format-pixf61bcbc50/mac",
    reason: { en: "Use Pixelmator Pro to inspect and edit the complete layered document.", "zh-CN": "如需检查和编辑完整分层文档，请使用 Pixelmator Pro。" },
  }],
);
