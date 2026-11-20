import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import { publicationCopy } from "@anyfile/rendering-publication";

export function chmCopy(locale: Locale) {
  return {
    ...publicationCopy(locale),
    ...selectMessages(locale, {
      en: {
        invalid: "The CHM help file is damaged or uses an unsupported layout.",
        limit: "This CHM help file exceeds the safe reading resource limits.",
        noTopics: "No readable HTML topics were found in this CHM archive.",
        unsupportedObject: "Unsupported embedded object",
      },
      "zh-CN": {
        invalid: "CHM 帮助文件已损坏或使用了不支持的格式结构。",
        limit: "此 CHM 帮助文件超过安全阅读资源上限。",
        noTopics: "在此 CHM 归档中未找到可阅读的 HTML 主题。",
        unsupportedObject: "不支持的嵌入对象",
      },
    }),
  };
}
