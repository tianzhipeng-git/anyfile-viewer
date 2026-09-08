import type { PublishedLocale } from "../i18n/config";

/** Keep the search preview and visible introduction focused on the same benefits. */
export function withViewerBenefits<T extends { title: string; description: string }>(copy: T, locale: PublishedLocale) {
  return {
    ...copy,
    searchTitle: locale === "zh-CN" ? `${copy.title} — 免费，无需上传` : `${copy.title} — Free, No Upload`,
    description: locale === "zh-CN"
      ? `${copy.description}免费使用，无需上传、注册或安装软件。`
      : `${copy.description} Free, with no uploads, signup or software installation.`,
  };
}
