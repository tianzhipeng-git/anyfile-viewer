import { defineFormat } from "./define-format";
export const visioFormats = ["vsdx", "vsd"].map((extension) => {
  const label = extension.toUpperCase();
  return defineFormat(extension, "documents", 3, {
    name: `Visio ${label}`, title: `Open ${label} Visio Drawings Online`, description: `View ${label} diagrams page by page in your browser, with zoom and pan and no file upload.`,
    introduction: extension === "vsdx" ? "VSDX stores Visio drawings as a ZIP package of XML parts. Anyfile reads the package locally and displays its drawing pages." : "VSD is the legacy binary Visio drawing format. Anyfile reads its compound-file streams locally to preview drawing pages.",
    canShow: ["Drawing pages, shapes, connectors and text", "Page selection, zoom, fit and pan"],
    limitations: ["Some fonts, embedded objects and proprietary effects may differ from Microsoft Visio", "No editing, macro execution or shape-data inspection", "128 MiB input, 512 pages, 64 MiB SVG output, 16 MiB per page and a 30-second parsing budget"],
    faq: [{ question: `Do I need Microsoft Visio to open ${label}?`, answer: "No. The drawing parser runs locally in your browser, without installing Visio or uploading the file." }],
  }, {
    name: `Visio ${label}`, title: `在线打开 ${label} Visio 绘图`, description: `在浏览器中逐页查看 ${label} 图表，支持缩放和拖动，无需上传文件。`,
    introduction: extension === "vsdx" ? "VSDX 将 Visio 绘图保存为包含 XML 部件的 ZIP 包。Anyfile 在本地读取该文件并显示绘图页面。" : "VSD 是旧版 Visio 二进制绘图格式。Anyfile 在本地读取复合文件中的数据流，预览绘图页面。",
    canShow: ["绘图页面、形状、连接线与文字", "页面选择、缩放、适合窗口与拖动"],
    limitations: ["部分字体、嵌入对象和专有效果可能与 Microsoft Visio 不同", "不提供编辑、宏执行或形状数据检查", "输入上限 128 MiB、512 页、SVG 总输出 64 MiB、单页 16 MiB，解析预算 30 秒"],
    faq: [{ question: `打开 ${label} 需要安装 Microsoft Visio 吗？`, answer: "不需要。解析器直接在浏览器本地运行，无需安装 Visio，也不会上传文件。" }],
  });
});
