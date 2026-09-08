import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import { publicationCopy } from "@anyfile/rendering-publication";
export function epubCopy(locale: Locale) {
  return { ...publicationCopy(locale), ...selectMessages(locale, {
    en: {
      invalid: "The EPUB is damaged or uses unsupported content.",
      protected: "Protected, obfuscated or fixed-layout EPUB content is not supported. No decryption is attempted.",
    },
    "zh-CN": {
      invalid: "EPUB 已损坏或包含不支持的内容。",
      protected: "不支持受保护、字体混淆或固定版式 EPUB；不会尝试解密。",
    },
  }) };
}
