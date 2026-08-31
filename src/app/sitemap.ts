import type { MetadataRoute } from "next";

import { PUBLISHED_LOCALES, alternateLanguages, localePath, siteUrl } from "@/i18n/config";
import { categories, formats } from "@/lib/catalog";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  const paths = [
    "/",
    "/view",
    ...categories.map(({ slug }) => `/categories/${slug}`),
    ...formats.map(({ extension }) => `/formats/${extension}`),
  ];
  return paths.flatMap((path) => PUBLISHED_LOCALES.map((locale) => ({
    url: new URL(localePath(locale, path), origin).toString(),
    alternates: {
      languages: Object.fromEntries(Object.entries(alternateLanguages(path)).map(([key, value]) => [
        key,
        new URL(value, origin).toString(),
      ])),
    },
  })));
}
