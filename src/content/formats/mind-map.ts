import { defineFormat } from "./define-format";

const formats = [
  ["xmind", "XMind", "ZIP with content.json or legacy content.xml", "包含 content.json 或旧版 content.xml 的 ZIP 包"],
  ["mmap", "MindManager", "ZIP with Document.xml", "包含 Document.xml 的 ZIP 包"],
  ["mm", "FreeMind / Freeplane", "an XML topic tree", "XML 主题树"],
] as const;
export const mindMapFormats = formats.map(([extension, name, storage, storageZh]) => defineFormat(extension, "documents", 3, {
  name, title: `Open ${name} Mind Maps Online`, description: `Browse ${extension.toUpperCase()} topic branches and notes locally in your browser.`,
  introduction: `${name} stores its mind map as ${storage}. Anyfile reads the saved topic hierarchy and presents a focused branch view without uploading the file.`,
  canShow: ["Topic titles, child branches and plain-text notes", "Sheet selection, parent/root navigation and paginated branches", "Saved hyperlinks as text, without contacting their destinations"],
  limitations: ["Original layout, images, attachments, relationships and task metadata are not reproduced; floating, summary and callout topics appear as branches", "Encrypted files are unsupported", "128 MiB input; 16 MiB topic content; 20,000 topics; 128 levels and sheets"],
  faq: [{ question: `Can I edit ${name} maps here?`, answer: "No. This is a local read-only structure viewer. Use the original application to edit or reproduce its exact layout." }],
}, {
  name, title: `在线打开 ${name} 思维导图`, description: `在浏览器本地浏览 ${extension.toUpperCase()} 主题分支与备注。`,
  introduction: `${name} 使用${storageZh}保存思维导图。Anyfile 读取已保存的主题层级，以聚焦分支的方式展示，无需上传文件。`,
  canShow: ["主题标题、子分支和纯文本备注", "画布切换、上级/中心主题导航与分支分页", "以文本显示保存的链接，不访问目标地址"],
  limitations: ["不还原原始布局、图片、附件、关联线和任务元数据；自由主题、概要主题和标注主题按分支展示", "不支持加密文件", "输入 128 MiB；主题内容 16 MiB；20,000 个主题；128 层与 128 个画布"],
  faq: [{ question: `可以编辑 ${name} 脑图吗？`, answer: "不可以。这是本地只读结构查看器。编辑或精确还原布局请使用原软件。" }],
}));
