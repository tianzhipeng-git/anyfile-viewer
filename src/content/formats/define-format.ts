import type { FormatContent, FormatCopy } from "../types";

export function defineFormat(
  extension: string,
  categoryId: string,
  typicalLevel: 1 | 2 | 3 | 4 | 5,
  en: FormatCopy,
  zh: FormatCopy,
  options: Partial<FormatContent["capability"]> = {},
  alternatives?: FormatContent["alternatives"],
  aliases?: readonly string[],
): FormatContent {
  return {
    extension,
    aliases,
    categoryId,
    status: "published",
    capability: { typicalLevel, verification: "verified", ...options },
    alternatives,
    copy: { en, "zh-CN": zh },
  };
}
