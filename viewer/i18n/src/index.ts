export const SUPPORTED_LOCALES = [
  "en",
  "zh-CN",
  "es",
  "de",
  "fr",
  "ja",
  "pt",
  "ru",
  "ko",
  "it",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const localeNames = {
  en: "English",
  "zh-CN": "简体中文",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  ja: "日本語",
  pt: "Português",
  ru: "Русский",
  ko: "한국어",
  it: "Italiano",
} as const satisfies Record<Locale, string>;

export type LocalizedText = Readonly<
  { en: string } & Partial<Record<Exclude<Locale, "en">, string>>
>;

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  if (isLocale(value)) return value;
  const normalized = value.toLowerCase();
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;
  const language = normalized.split("-")[0];
  if (language === "zh") return "zh-CN";
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === language) ?? DEFAULT_LOCALE;
}

export function localizeText(text: LocalizedText, locale: Locale): string {
  const translated = text[locale];
  return translated?.trim() ? translated : text.en;
}

export function selectMessages<T>(
  locale: Locale,
  messages: Readonly<{ en: T; "zh-CN": T } & Partial<Record<Exclude<Locale, "en" | "zh-CN">, T>>>,
): T {
  return messages[locale] ?? messages.en;
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(value: Date | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function compareText(left: string, right: string, locale: Locale): number {
  return new Intl.Collator(locale).compare(left, right);
}

export function interpolate(
  message: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, key: string) => (
    Object.hasOwn(values, key) ? String(values[key]) : placeholder
  ));
}
