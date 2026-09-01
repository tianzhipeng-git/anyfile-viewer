import type { Metadata } from "next";

import { alternateLanguages, localePath, type PublishedLocale } from "../i18n/config";

const openGraphLocales: Record<PublishedLocale, string> = {
  en: "en_US",
  "zh-CN": "zh_CN",
};

export function localizedPageMetadata({
  locale,
  path = "/",
  title,
  description,
}: {
  locale: PublishedLocale;
  path?: string;
  title: string;
  description: string;
}): Metadata {
  const url = localePath(locale, path);
  const socialImage = {
    url: localePath(locale, "/opengraph-image"),
    width: 1200,
    height: 630,
    alt: locale === "zh-CN" ? "Anyfile — 免费在线文件查看器" : "Anyfile — Free online file viewer",
  };
  return {
    title,
    description,
    alternates: { canonical: url, languages: alternateLanguages(path) },
    openGraph: {
      type: "website",
      url,
      siteName: "Anyfile",
      title,
      description,
      locale: openGraphLocales[locale],
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}
