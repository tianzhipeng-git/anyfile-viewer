"use client";

import { usePathname } from "next/navigation";
import { localeNames } from "@anyfile/i18n";

import { PUBLISHED_LOCALES, type PublishedLocale } from "@/i18n/config";

export function LanguageSwitcher({ locale, label }: { locale: PublishedLocale; label: string }) {
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="sr-only">{label}</span>
      <select
        className="h-8 rounded-md border border-background/20 bg-foreground px-2 text-background"
        value={locale}
        aria-label={label}
        onChange={(event) => {
          const nextLocale = event.currentTarget.value as PublishedLocale;
          const nextPath = pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, `/${nextLocale}`);
          window.location.assign(nextPath);
        }}
      >
        {PUBLISHED_LOCALES.map((candidate) => (
          <option key={candidate} value={candidate}>{localeNames[candidate]}</option>
        ))}
      </select>
    </label>
  );
}
