import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Code2Icon, MailIcon } from "lucide-react";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { SITE_INFO_SLUGS, getSiteInfoPage, isSiteInfoSlug } from "@/content/site-info";
import { isPublishedLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { localizedPageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return SITE_INFO_SLUGS.map((info) => ({ info }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; info: string }> }): Promise<Metadata> {
  const { locale, info } = await params;
  if (!isPublishedLocale(locale) || !isSiteInfoSlug(info)) return {};
  const page = getSiteInfoPage(info, locale);
  return localizedPageMetadata({ locale, path: `/${info}`, title: page.title, description: page.description });
}

export default async function SiteInfoPage({ params }: { params: Promise<{ locale: string; info: string }> }) {
  const { locale, info } = await params;
  if (!isPublishedLocale(locale) || !isSiteInfoSlug(info)) notFound();
  const dictionary = await getDictionary(locale);
  const page = getSiteInfoPage(info, locale);

  return (
    <section className="bg-background py-14 sm:py-20">
      <div className="content-shell flex max-w-4xl flex-col gap-10">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale)} />}>{dictionary.common.home}</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{page.title}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <header className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold text-primary">{page.eyebrow}</p>
          <h1 className="display-title text-5xl sm:text-6xl">{page.title}</h1>
          <p className="mt-6 text-xl leading-8 text-muted-foreground">{page.description}</p>
        </header>
        <div className="max-w-3xl border-t">
          {page.sections.map((section) => (
            <section className="grid gap-3 border-b py-8 sm:grid-cols-[13rem_1fr] sm:gap-8" key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="space-y-4 leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <a className="inline-flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary" href="mailto:support@anyfile.top">
            <MailIcon className="size-4" aria-hidden="true" />support@anyfile.top
          </a>
          {(info === "about" || info === "contact") && (
            <a className="inline-flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary" href="https://github.com/tianzhipeng-git/anyfile-viewer" rel="noreferrer" target="_blank">
              <Code2Icon className="size-4" aria-hidden="true" />github.com/tianzhipeng-git/anyfile-viewer
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
