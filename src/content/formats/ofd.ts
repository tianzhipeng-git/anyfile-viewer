import { defineFormat } from "./define-format";

export const ofdFormat = defineFormat(
  "ofd",
  "documents",
  4,
  {
    name: "OFD document",
    title: "Open OFD Files Online",
    description: "View Chinese OFD e-invoices, official documents and contracts with their seals in your browser, no reader needed.",
    introduction:
      "OFD (GB/T 33190) is China's fixed-layout format for VAT e-invoices, government documents and e-contracts, yet Windows, macOS and browsers cannot open it without a dedicated client. Anyfile unpacks the OFD package locally, merges page templates, annotations and electronic seal stamps, and draws vector paths, embedded-font glyphs and images onto Canvas page by page.",
    canShow: [
      "Multi-page OFD documents with page templates, layers, composite graphics, clips and watermark annotations",
      "Text from embedded TrueType fonts (including CGTransform glyph mapping) or matching system fonts, a selectable text layer, outline and thumbnails",
      "Electronic seal stamps stored as PNG/JPEG/GIF/BMP pictures or nested seal OFD files in GB/T 38540 signatures",
    ],
    limitations: [
      "Signatures are shown but not cryptographically verified",
      "JBIG2 images are skipped; CFF-based and non-embedded fonts fall back to system fonts",
      "512 MiB file size, 10,000 pages and per-page object budgets apply",
    ],
    faq: [
      {
        question: "Is my e-invoice uploaded to a server?",
        answer: "No. The OFD package is read from your device and every page is rendered in the browser; invoice and contract contents never leave your computer.",
      },
      {
        question: "Does Anyfile check whether the seal is genuine?",
        answer: "No. The seal picture is displayed where the signature places it, but certificate and signature verification require the issuing authority's tools.",
      },
    ],
  },
  {
    name: "OFD 版式文档",
    title: "在线打开 OFD 文件",
    description: "无需安装 OFD 阅读器，在浏览器本地查看 OFD 电子发票、公文与电子合同及其电子签章。",
    introduction:
      "OFD（GB/T 33190）是我国增值税电子发票、政务公文和电子合同的版式文档标准，但 Windows、macOS 与浏览器都无法直接打开，只能安装专用客户端。Anyfile 在本地解开 OFD 文档包，合并模板页、注释与电子签章，把矢量路径、内嵌字体字形和图片逐页绘制到 Canvas。",
    canShow: [
      "多页 OFD 文档，含模板页、图层、复合图元、裁剪与水印注释",
      "内嵌 TrueType 字体（含 CGTransform 字形映射）或对应系统字体绘制的文字、可选择文本层、大纲与缩略图",
      "GB/T 38540 签名中以 PNG/JPEG/GIF/BMP 图片或嵌套印章 OFD 保存的电子签章",
    ],
    limitations: [
      "电子签章仅显示，不做密码学验签",
      "跳过 JBIG2 图片；CFF 轮廓字体与未嵌入字体回退为系统字体",
      "适用单文件 512 MiB、最多 10,000 页与单页图元数量预算",
    ],
    faq: [
      {
        question: "打开电子发票需要上传到服务器吗？",
        answer: "不需要。OFD 文档包直接从本机读取，所有页面都在浏览器中渲染，发票与合同内容不会离开你的电脑。",
      },
      {
        question: "Anyfile 会校验印章真伪吗？",
        answer: "不会。签章图片按签名记录的位置显示，证书与签名验证需要使用开具方或税务机关提供的工具。",
      },
    ],
  },
  { possibleLevels: [4], verification: "pending" },
);
