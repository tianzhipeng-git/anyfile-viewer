import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export const mindMapCopy = (locale: Locale) => selectMessages(locale, {
  en: {
    reading: "Reading mind map…", invalid: "The file is damaged, encrypted, or is not a supported mind map.",
    limit: "The mind map exceeds the safe reading limit.", environment: "This browser cannot decode this mind map.",
    sheet: "Sheet", untitled: "Untitled topic", parent: "Parent topic", home: "Root topic", previous: "Previous branches", next: "Next branches",
    branches: "Branches", notes: "Notes", link: "Link", leaf: "No child topics", diagram: "Mind map branches",
    limitation: "Topic structure preview. Original layout, images, attachments, relationships and task metadata are not reproduced. Floating, summary and callout topics appear as branches.",
  },
  "zh-CN": {
    reading: "正在读取思维导图…", invalid: "文件已损坏、已加密，或不是受支持的思维导图。",
    limit: "思维导图超出安全读取上限。", environment: "当前浏览器无法解码此思维导图。",
    sheet: "画布", untitled: "未命名主题", parent: "上级主题", home: "中心主题", previous: "上一组分支", next: "下一组分支",
    branches: "分支", notes: "备注", link: "链接", leaf: "没有子主题", diagram: "思维导图分支",
    limitation: "当前为主题结构预览，不还原原始布局、图片、附件、关联线与任务元数据。自由主题、概要主题和标注主题按分支展示。",
  },
});
export type MindMapCopy = ReturnType<typeof mindMapCopy>;
