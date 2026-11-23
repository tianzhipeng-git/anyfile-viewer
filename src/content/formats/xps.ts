import { defineFormat } from "./define-format";

export const xpsFormat = defineFormat(
  "xps",
  "documents",
  4,
  {
    name: "XPS document",
    title: "Open XPS and OXPS Files Online",
    description: "View .xps and .oxps fixed-layout documents in your browser without the Windows XPS Viewer.",
    introduction:
      "Windows 10 and 11 no longer install the XPS Viewer by default, and macOS or Linux never had one, yet invoices, tax forms and medical printouts are still saved through the Microsoft XPS Document Writer. Anyfile unpacks the XPS / OpenXPS package locally, reads each FixedPage markup and draws its vector paths, embedded-font glyphs and images onto Canvas page by page.",
    canShow: [
      "Microsoft XPS (.xps) and ECMA-388 OpenXPS (.oxps) packages, including interleaved page pieces",
      "Paths, solid and gradient brushes, tiled image and visual brushes, clips, transforms and opacity masks",
      "Text drawn from embedded and obfuscated TrueType fonts, a selectable text layer, document outline and page thumbnails",
    ],
    limitations: [
      "JPEG XR (HD Photo) images are skipped and CFF-based OpenType fonts fall back to a system font",
      "Colour profiles are not applied and nested group opacity is approximated; hyperlinks and print tickets are ignored",
      "512 MiB file size, 10,000 pages and per-page element budgets apply",
    ],
    faq: [
      {
        question: "Is my XPS file uploaded for conversion to PDF?",
        answer:
          "No. The package is read from your device, page markup is parsed in the browser and every page is rendered to Canvas locally; nothing is sent to a server.",
      },
      {
        question: "What is the difference between .xps and .oxps?",
        answer:
          "OXPS is the standardised OpenXPS variant that Windows 8 and later produce by default. It uses different XML namespaces but the same fixed-page model, so Anyfile opens both.",
      },
    ],
  },
  {
    name: "XPS 文档",
    title: "在线打开 XPS 与 OXPS 文件",
    description: "无需 Windows XPS 查看器，在浏览器本地查看 .xps / .oxps 固定版式文档。",
    introduction:
      "Windows 10/11 默认不再预装 XPS 查看器，macOS 与 Linux 更是从未提供，但发票、税务表单和医疗打印件仍常通过 Microsoft XPS Document Writer 保存。Anyfile 在本地解开 XPS / OpenXPS 文档包，逐页读取 FixedPage 标记，把矢量路径、内嵌字体字形和图片绘制到 Canvas。",
    canShow: [
      "Microsoft XPS（.xps）与 ECMA-388 OpenXPS（.oxps）文档包，包括交错分片（piece）页面",
      "路径、纯色与渐变画刷、平铺图片画刷与视觉画刷、裁剪、变换与不透明度蒙版",
      "使用内嵌及混淆 TrueType 字体绘制的文字、可选择文本层、文档目录与页面缩略图",
    ],
    limitations: [
      "跳过 JPEG XR（HD Photo）图片，CFF 轮廓的 OpenType 字体回退为系统字体",
      "不应用颜色配置文件，嵌套组不透明度为近似效果；忽略超链接与打印票据",
      "适用单文件 512 MiB、最多 10,000 页与单页元素数量预算",
    ],
    faq: [
      {
        question: "查看 XPS 需要上传文件转换成 PDF 吗？",
        answer: "不需要。文档包直接从本机读取，页面标记在浏览器中解析并逐页渲染到 Canvas，任何内容都不会发送到服务器。",
      },
      {
        question: ".xps 和 .oxps 有什么区别？",
        answer: "OXPS 是 Windows 8 及以后默认生成的标准化 OpenXPS 格式，XML 命名空间不同但固定页面模型相同，Anyfile 两种都能打开。",
      },
    ],
  },
  { possibleLevels: [4], verification: "pending" },
  undefined,
  ["oxps"],
);
