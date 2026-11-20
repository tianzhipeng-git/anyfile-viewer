import { calibreAlternative } from "./archive-shared";
import { defineFormat } from "./define-format";

export const chmFormat = defineFormat(
  "chm",
  "ebooks",
  4,
  {
    name: "Microsoft Compiled HTML Help",
    title: "Read CHM Help Files Online",
    description: "Read local .chm help manuals with contents tree, keyword index, internal links and images.",
    introduction:
      "Open Microsoft Compiled HTML Help (.chm) files directly in your browser on macOS, Linux or Windows without uploading them. Anyfile parses the ITSF/ITSP directory, decodes LZX-compressed topics on demand and renders HTML safely inside a script-free sandbox.",
    canShow: [
      "Contents tree (.hhc), keyword index (.hhk) and topic reading order with back/forward history",
      "LZX-compressed and uncompressed HTML topics with LCID/meta encoding detection and local styles",
      "Internal topic links, fragment anchors and embedded PNG, JPEG, GIF, WebP, BMP, ICO and SVG images",
    ],
    limitations: [
      "Scripts, ActiveX objects, forms, remote subresources and cross-CHM ms-its: links are disabled",
      "Full-text search ($FIftiMain) is not indexed; 128 MiB file input and 128 MiB section expansion limits apply",
    ],
    faq: [
      {
        question: "Can I open Windows CHM manuals on macOS or Linux?",
        answer:
          "Yes. Anyfile includes a local ITSF/ITSP reader and LZX decompressor in JavaScript, so CHM files open directly in your browser without Windows or extra desktop apps.",
      },
      {
        question: "Are scripts or ActiveX controls inside CHM files executed?",
        answer:
          "No. Topic HTML and CSS are sanitized before rendering inside a sandboxed iframe with scripts, forms and network requests blocked.",
      },
    ],
  },
  {
    name: "CHM 编译 HTML 帮助文档",
    title: "在线阅读 CHM 帮助文档",
    description: "在浏览器本地打开 .chm 手册与电子书，支持目录树、索引、内部链接与图片。",
    introduction:
      "无需 Windows 或桌面软件，在 macOS、Linux 或 Windows 浏览器中直接本地打开 Microsoft 编译 HTML 帮助文档（.chm）。Anyfile 解析 ITSF/ITSP 目录、按需解码 LZX 压缩主题，并在无脚本沙箱中安全渲染正文。",
    canShow: [
      "目录树（.hhc）、关键词索引（.hhk）、主题阅读顺序及前进/后退历史导航",
      "LZX 压缩与未压缩 HTML 主题，支持 LCID/meta 编码识别与本地样式",
      "内部主题链接、页内锚点及内嵌 PNG、JPEG、GIF、WebP、BMP、ICO 与 SVG 图片",
    ],
    limitations: [
      "禁用脚本、ActiveX 对象、表单、远程子资源与跨 CHM 的 ms-its: 链接",
      "暂不提供全文搜索索引（$FIftiMain）；主文件与压缩区展开上限均为 128 MiB",
    ],
    faq: [
      {
        question: "可以在 macOS 或 Linux 上打开 Windows CHM 手册吗？",
        answer:
          "可以。Anyfile 在本地实现了 ITSF/ITSP 解析与 LZX 解码，无需依赖 Windows 系统或安装桌面阅读器即可直接在浏览器查看。",
      },
      {
        question: "CHM 里的脚本或 ActiveX 控件会运行吗？",
        answer:
          "不会。主题 HTML 与 CSS 会先经过白名单清理，再放入禁用脚本、表单和网络请求的沙箱框架中显示。",
      },
    ],
  },
  { possibleLevels: [4], verification: "verified" },
  calibreAlternative,
);
