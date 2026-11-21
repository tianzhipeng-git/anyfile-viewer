import { defineFormat } from "./define-format";

export const rtfFormat = defineFormat("rtf", "documents", 3,
  {
    name: "Rich Text Format document",
    title: "Open RTF Documents Online in Your Browser",
    description: "Read Rich Text Format (.rtf) files locally with formatted text, tables, Unicode and embedded images.",
    introduction: "RTF encodes formatted text, codepages, tables and inline pictures as control-word groups. Anyfile parses RTF locally without uploading your file.",
    canShow: ["Headings, paragraphs, lists, text styles and colors", "Tables, Unicode escapes, codepage text and sanitized links", "Embedded PNG, JPEG and DIB/BMP pictures"],
    limitations: ["Headers, footers and complex floating frames are omitted", "Embedded OLE objects and WMF/EMF vector metafiles are not rendered"],
    faq: [{ question: "Does Anyfile support non-English RTF files?", answer: "Yes. The RTF parser handles Unicode \\u escapes and ANSI codepages declared via \\ansicpg and \\fcharset." }],
  },
  {
    name: "RTF 富文本文档",
    title: "在浏览器中本地打开 RTF 文档",
    description: "无需下载软件，直接在浏览器本地查看 RTF 富文本格式中的文字样式、表格与图片。",
    introduction: "RTF 通过控制字分组记录排版、代码页、表格与内嵌图片。Anyfile 在本地解析 RTF 语法并安全渲染，不上传文件内容。",
    canShow: ["标题、段落、列表、字体样式与颜色", "表格、Unicode 转义、多语言代码页与安全超链接", "内嵌 PNG、JPEG 与 DIB/BMP 图片"],
    limitations: ["暂不展示页眉页脚与复杂浮动文本框", "不渲染内嵌 OLE 对象与 WMF/EMF 矢量图元"],
    faq: [{ question: "支持中文等非英文编码的 RTF 文件吗？", answer: "支持。解析器会处理 Unicode \\u 转义以及 \\ansicpg 和 \\fcharset 声明的代码页。" }],
  },
);
