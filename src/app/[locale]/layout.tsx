import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { GoogleAnalytics } from "@/components/google-analytics";
import { PwaLifecycle } from "@/components/pwa-lifecycle";
import { SafeSpeedInsights } from "@/components/safe-speed-insights";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FeedbackProvider } from "@/components/feedback/feedback-provider";
import { PUBLISHED_LOCALES, isPublishedLocale, localePath, siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { localizedPageMetadata } from "@/lib/seo";

import "../globals.css";

export const dynamicParams = false;

export const viewport: Viewport = {
  themeColor: "#1c1c1c",
};

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
    manifest: localePath(candidate, "/manifest.webmanifest"),
    appleWebApp: {
      capable: true,
      title: "Anyfile",
      statusBarStyle: "default",
    },
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
        <FeedbackProvider locale={locale} dictionary={dictionary.feedback}
          endpoint={process.env.NEXT_PUBLIC_FEEDBACK_ENDPOINT ?? ""}>
          <SiteHeader locale={locale} dictionary={dictionary} />
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter locale={locale} dictionary={dictionary} />
        </FeedbackProvider>
        <PwaLifecycle />
        <GoogleAnalytics />
        <SafeSpeedInsights />
      </body>
    </html>
  );
}
