import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export const mindMapCopy = (locale: Locale) => selectMessages(locale, {
  en: {
    reading: "Reading mind map…", invalid: "The file is damaged, encrypted, or is not a supported mind map.",
    limit: "The mind map exceeds the safe reading limit.", environment: "This browser cannot decode this mind map.",
    sheet: "Sheet", untitled: "Untitled topic",
    notes: "Notes", link: "Link", diagram: "Mind map",
    closeDetails: "Close details",
    fit: "Fit map", expand: "Expand", collapse: "Collapse", expandAll: "Expand all", search: "Search topics", find: "Find next",
    markers: "Markers", labels: "Labels", metadata: "Task / attributes", image: "Image", unavailableImage: "The referenced image is unavailable locally.",
    attachment: "Attachment", unavailableAttachment: "This attachment type has no inline preview.",
    topics: "Visible topics", navigation: "Drag to pan · Scroll to zoom · 0 to fit", noResults: "No matching topics",
  },
  "zh-CN": {
    reading: "正在读取思维导图…", invalid: "文件已损坏、已加密，或不是受支持的思维导图。",
    limit: "思维导图超出安全读取上限。", environment: "当前浏览器无法解码此思维导图。",
    sheet: "画布", untitled: "未命名主题",
    notes: "备注", link: "链接", diagram: "思维导图",
    closeDetails: "关闭详情",
    fit: "适合画布", expand: "展开", collapse: "折叠", expandAll: "展开全部", search: "搜索主题", find: "查找下一个",
    markers: "图标", labels: "标签", metadata: "任务 / 属性", image: "图片", unavailableImage: "本地缺少此引用图片。",
    attachment: "附件", unavailableAttachment: "此附件类型暂不支持内嵌预览。",
    topics: "可见主题", navigation: "拖动平移 · 滚轮缩放 · 0 适合画布", noResults: "没有匹配的主题",
  },
});
export type MindMapCopy = ReturnType<typeof mindMapCopy>;
