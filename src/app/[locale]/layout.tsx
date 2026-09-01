import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PUBLISHED_LOCALES, isPublishedLocale, siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { localizedPageMetadata } from "@/lib/seo";

import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLISHED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: candidate } = await params;
  if (!isPublishedLocale(candidate)) return {};
  const dictionary = await getDictionary(candidate);
  const pageMetadata = localizedPageMetadata({
    locale: candidate,
    title: dictionary.metadata.siteTitle,
    description: dictionary.metadata.siteDescription,
  });
  return {
    ...pageMetadata,
    metadataBase: siteUrl(),
    title: { default: dictionary.metadata.siteTitle, template: `%s — Anyfile` },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader locale={locale} dictionary={dictionary} />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter locale={locale} dictionary={dictionary} />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
