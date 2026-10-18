import { defineFormat } from "./define-format";

const formats = [
  ["xmind", "XMind", "ZIP with content.json or legacy content.xml", "包含 content.json 或旧版 content.xml 的 ZIP 包"],
  ["mmap", "MindManager", "ZIP with Document.xml", "包含 Document.xml 的 ZIP 包"],
  ["mm", "FreeMind / Freeplane", "an XML topic tree", "XML 主题树"],
] as const;
export const mindMapFormats = formats.map(([extension, name, storage, storageZh]) => defineFormat(extension, "documents", 3, {
  name, title: `Open ${name} Mind Maps Online`, description: `Browse ${extension.toUpperCase()} topic branches and notes locally in your browser.`,
  introduction: `${name} stores its mind map as ${storage}. Anyfile reads the saved topic hierarchy and renders an interactive mind map without uploading the file.`,
  canShow: ["Complete topic hierarchy with connected branches, folding, search, pan and zoom", "Topic colors, fonts, local images, markers, labels and notes", "XMind floating topics, summaries, boundaries and relationships; FreeMind arrow links"],
  limitations: ["Automatic layout uses saved structure and direction; proprietary layouts and rich-text typography can differ from the original application. Inline attachments support text and images", "Encrypted files are unsupported", "128 MiB input; 16 MiB topic content; 20,000 topics; 128 levels and sheets"],
  faq: [{ question: `Can I edit ${name} maps here?`, answer: "No. This is a local read-only mind map viewer." }],
}, {
  name, title: `在线打开 ${name} 思维导图`, description: `在浏览器本地浏览 ${extension.toUpperCase()} 主题分支与备注。`,
  introduction: `${name} 使用${storageZh}保存思维导图。Anyfile 读取已保存的主题层级，在可缩放的脑图画布中展示，无需上传文件。`,
  canShow: ["完整主题层级与连线，支持折叠、搜索、平移与缩放", "主题颜色、字体大小、本地图片、图标、标签和备注", "XMind 自由主题、概要、边界与关联线；FreeMind 箭头链接"],
  limitations: ["根据保存的结构与方向自动布局；专有布局和富文本排版可能与原软件不同。附件支持文本和图片内嵌查看", "不支持加密文件", "输入 128 MiB；主题内容 16 MiB；20,000 个主题；128 层与 128 个画布"],
  faq: [{ question: `可以编辑 ${name} 脑图吗？`, answer: "不可以。这是本地只读思维导图查看器。" }],
}));
