import type { CategoryContent } from "./types";

export const categoryContents: readonly CategoryContent[] = [
  {
    slug: "images-video", status: "published",
    copy: {
      en: { name: "Images & media", eyebrow: "SEE AND HEAR LOCAL FILES", title: "Image, video and audio viewers", description: "Open selected images and media locally with browser decoders or dedicated viewers.", introduction: "This category covers still images, camera originals, audio and video. Support depends on both the container and the codec inside it, so each format page states the combinations Anyfile actually handles.", useCases: ["Check an image without sending it to a cloud service", "Play supported audio and video from local storage", "Inspect camera originals and less common raster formats"], commonProblems: ["A recognized video container can contain an unsupported codec", "RAW rendering varies by camera model and embedded preview", "Very large images can exceed browser memory or canvas limits"], faq: [{ question: "Does every browser support the same media formats?", answer: "No. Native codecs and WebCodecs support vary by browser and operating system; each format page calls out important requirements." }] },
      "zh-CN": { name: "图片与音视频", eyebrow: "在本地看见与听见", title: "图片、视频与音频查看器", description: "通过浏览器解码能力或专用查看器，在本地打开所选图片与媒体文件。", introduction: "这一类别包含静态图片、相机原片、音频和视频。媒体能力同时取决于容器与内部 codec，因此各格式页只说明 Anyfile 实际处理的组合。", useCases: ["不发送到云端即可检查图片", "直接播放本地存储中的受支持音视频", "查看相机原片和较少见的栅格格式"], commonProblems: ["视频容器可识别，但内部 codec 可能不受支持", "RAW 呈现结果会随相机型号和内嵌预览变化", "超大图片可能超过浏览器内存或 Canvas 限制"], faq: [{ question: "不同浏览器支持的媒体格式相同吗？", answer: "不同。原生 codec 和 WebCodecs 能力会随浏览器及操作系统变化，各格式页会注明重要条件。" }] },
    },
  },
  {
    slug: "documents", status: "published",
    copy: {
      en: { name: "Documents", eyebrow: "READ WITHOUT AN UPLOAD QUEUE", title: "Document, spreadsheet and presentation viewers", description: "Read common office files locally while keeping the original file on your device.", introduction: "Document viewers reconstruct readable output in the browser. They are intended for review, not editing, and complex desktop-only layout features may render differently.", useCases: ["Read a PDF or DOCX on an untrusted machine", "Inspect workbook values and worksheets", "Review PPTX slides without installing office software"], commonProblems: ["Password-protected or encrypted files may not open", "Macros, external links and active content are not executed", "Fonts and advanced layout effects can differ from desktop applications"], faq: [{ question: "Can I edit office files in Anyfile?", answer: "No. Anyfile is deliberately read-only; use the authoring application when you need to edit and save a document." }] },
      "zh-CN": { name: "文档", eyebrow: "阅读，无需上传等待", title: "文档、表格与演示文稿查看器", description: "在本地阅读常见办公文件，原文件始终留在当前设备。", introduction: "文档查看器在浏览器中重建可读内容，定位是检查而非编辑；依赖桌面软件的复杂版式能力可能会有差异。", useCases: ["在不可信设备上阅读 PDF 或 DOCX", "检查工作簿数值与工作表", "无需安装办公软件即可审阅 PPTX 幻灯片"], commonProblems: ["受密码保护或加密的文件可能无法打开", "不会执行宏、外部链接和活动内容", "字体和高级版式效果可能与桌面应用不同"], faq: [{ question: "可以在 Anyfile 中编辑办公文件吗？", answer: "不可以。Anyfile 有意保持只读；需要编辑和保存时请使用对应的创作软件。" }] },
    },
  },
  {
    slug: "code-data", status: "published",
    copy: {
      en: { name: "Code & data", eyebrow: "MAKE STRUCTURE VISIBLE", title: "Code, structured data and database viewers", description: "Inspect text, tables and databases locally for review and troubleshooting.", introduction: "Code and data formats need different views: syntax-oriented text for source files, paged tables for records, and schema navigation for databases. Anyfile chooses from the registered viewers without executing file content.", useCases: ["Review source or configuration text read-only", "Page through JSON and tabular data", "Inspect SQLite tables and HTTP Archive requests"], commonProblems: ["Malformed text or mixed encodings can prevent parsing", "Nested records do not always map cleanly to a table", "Large queries and files remain bounded by browser memory"], faq: [{ question: "Does opening code or data execute it?", answer: "No. These viewers parse or display selected files and do not run scripts, database triggers or embedded application code." }] },
      "zh-CN": { name: "代码与数据", eyebrow: "让结构清晰可见", title: "代码、结构化数据与数据库查看器", description: "在本地检查文本、表格和数据库，用于审阅与排错。", introduction: "代码与数据需要不同视图：源码适合语法导向的文本视图，记录适合分页表格，数据库则需要 schema 导航。Anyfile 从已注册查看器中选择，且不会执行文件内容。", useCases: ["只读审阅源码或配置文本", "分页浏览 JSON 与表格数据", "检查 SQLite 数据表和 HTTP Archive 请求"], commonProblems: ["损坏文本或混合编码可能导致解析失败", "嵌套记录不一定能自然映射为表格", "大查询和大文件仍受浏览器内存限制"], faq: [{ question: "打开代码或数据会执行其中内容吗？", answer: "不会。这些查看器只解析或展示所选文件，不运行脚本、数据库触发器或内嵌应用代码。" }] },
    },
  },
  {
    slug: "developer-artifacts", status: "published",
    copy: {
      en: { name: "Developer artifacts", eyebrow: "UNDERSTAND BUILD OUTPUTS", title: "Binary and package inspection tools", description: "Inspect arrays, compiled modules, source maps and archives without executing their payloads.", introduction: "Developer artifacts are often opaque in a text editor. These viewers expose safe structural summaries, indexes and paged values while keeping execution outside the viewing path.", useCases: ["Check NumPy shapes and values", "Review WebAssembly imports and exports", "Browse package contents or source-map coverage"], commonProblems: ["Corrupt headers make structural parsing impossible", "Inspection does not reproduce runtime behavior", "Compressed or huge entries may hit explicit safety limits"], faq: [{ question: "Are package scripts or WebAssembly modules executed?", answer: "No. Anyfile reads their structure only and does not install packages or instantiate WebAssembly modules." }] },
      "zh-CN": { name: "开发者产物", eyebrow: "看清编译与打包结果", title: "二进制与软件包检查工具", description: "检查数组、编译模块、Source Map 与归档结构，不执行其中载荷。", introduction: "开发者产物在文本编辑器中通常难以理解。这些查看器提供安全的结构摘要、索引与分页数值，并把执行行为排除在查看路径之外。", useCases: ["检查 NumPy 形状与数值", "审阅 WebAssembly 导入与导出", "浏览软件包内容或 Source Map 覆盖"], commonProblems: ["文件头损坏会导致结构解析失败", "结构检查不能复现运行时行为", "压缩或超大条目可能触发明确的安全限制"], faq: [{ question: "会执行软件包脚本或 WebAssembly 模块吗？", answer: "不会。Anyfile 只读取其结构，不安装软件包，也不实例化 WebAssembly 模块。" }] },
    },
  },
];
