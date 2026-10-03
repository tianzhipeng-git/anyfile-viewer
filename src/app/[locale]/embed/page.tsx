import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileWorkspace } from "@/components/file-workspace";
import { isPublishedLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";

export const metadata: Metadata = { title: "Anyfile file preview", robots: { index: false, follow: false } };

export default async function EmbedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  return <section className="viewer-page embed-page flex min-h-0 flex-1 bg-muted"><FileWorkspace locale={locale} dictionary={dictionary} embedded /></section>;
}
