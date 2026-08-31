import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FileWorkspace } from "@/components/file-workspace";
import { alternateLanguages, isPublishedLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPublishedLocale(locale)) return {};
  const dictionary = await getDictionary(locale);
  return {
    title: dictionary.metadata.viewerTitle,
    description: dictionary.metadata.viewerDescription,
    alternates: { canonical: localePath(locale, "/view"), languages: alternateLanguages("/view") },
  };
}

export default async function ViewerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  return <section className="viewer-page flex min-h-0 flex-1 bg-muted"><FileWorkspace locale={locale} dictionary={dictionary} /></section>;
}
