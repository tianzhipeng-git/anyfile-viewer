import { isLocale, type Locale } from "@anyfile/i18n";

export const PUBLISHED_LOCALES = ["en", "zh-CN"] as const satisfies readonly Locale[];
export type PublishedLocale = (typeof PUBLISHED_LOCALES)[number];

export function isPublishedLocale(value: string): value is PublishedLocale {
  return (PUBLISHED_LOCALES as readonly string[]).includes(value);
}

export function assertPublishedLocale(value: string): PublishedLocale {
  if (!isLocale(value) || !isPublishedLocale(value)) throw new Error(`Unsupported published locale: ${value}`);
  return value;
}

export function localePath(locale: PublishedLocale, path = "/"): string {
  const normalized = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalized}`;
}

export function alternateLanguages(path = "/") {
  return {
    en: localePath("en", path),
    "zh-CN": localePath("zh-CN", path),
    "x-default": localePath("en", path),
  };
}

export function siteUrl(): URL {
  const fallback = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://www.anyfile.top";
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? fallback);
  if (url.hostname === "anyfile.top") url.hostname = "www.anyfile.top";
  return url;
}
