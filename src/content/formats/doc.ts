import { defineFormat } from "./define-format";

export const docFormat = defineFormat("doc", "documents", 3,
  {
    name: "Legacy Word document",
    title: "Open DOC Files Online Without Word",
    description: "Read binary Word 97–2003 (.doc) and Word 6.0 documents locally in your browser without uploading.",
    introduction: "DOC stores Word text, formatting pieces, tables and embedded drawings inside a Compound File Binary Format (CFBF) container. Anyfile parses the WordDocument and Table streams directly in your browser to show headings, styles, tables, footnotes and embedded images.",
    canShow: ["Paragraphs, headings, lists and tables", "Bold, italic, underline, font sizes, colors and hyperlinks", "Embedded PNG/JPEG/BMP images and document metadata"],
    limitations: ["Password-protected or encrypted DOC files are not supported", "Complex floating layouts, macros and legacy WMF/EMF vector drawings are not reproduced"],
    faq: [{ question: "Are legacy .doc files uploaded to convert them?", answer: "No. Anyfile reads the CFBF binary streams locally in your browser so private legacy documents never leave your device." }],
  },
  {
    name: "旧版 Word 文档",
    title: "免上传在线打开 DOC 文档",
    description: "无需安装桌面 Office，直接在浏览器本地阅读 Word 97–2003（.doc）与 Word 6.0 文档。",
    introduction: "DOC 将正文、格式片段、表格与内嵌图片封装在 CFBF 复合二进制容器中。Anyfile 直接在浏览器本地解析 WordDocument 与 Table 流，还原标题、样式、表格、脚注和内嵌图片。",
    canShow: ["段落、标题、列表与表格", "粗斜体、下划线、字号、颜色与超链接", "内嵌 PNG/JPEG/BMP 图片与文档摘要信息"],
    limitations: ["不支持受密码保护或加密的 DOC 文件", "不执行宏，也不完整还原复杂浮动版式与 WMF/EMF 矢量图元"],
    faq: [{ question: "打开旧版 .doc 文件需要上传到服务器转换吗？", answer: "不需要。Anyfile 在浏览器本地直接解析 CFBF 二进制流，隐私文档不会离开当前设备。" }],
  },
);
