import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, CheckIcon, LockKeyholeIcon, ZapIcon } from "lucide-react";
import { interpolate } from "@anyfile/i18n";

import { FormatGlyph } from "@/components/format-glyph";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { alternateLanguages, isPublishedLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { categories, formats, getCategory, getFormat } from "@/lib/catalog";

const benefitIcons = [ZapIcon, LockKeyholeIcon, CheckIcon];
export function generateStaticParams() { return formats.map(({ extension }) => ({ extension })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string; extension: string }> }): Promise<Metadata> {
  const { locale, extension } = await params;
  if (!isPublishedLocale(locale)) return {};
  const dictionary = await getDictionary(locale);
  const format = getFormat(extension, locale);
  if (!format) return {};
  const path = `/formats/${extension}`;
  return { title: `${format.name} ${dictionary.format.viewerSuffix}`, description: interpolate(dictionary.format.metadataDescription, { name: format.name, description: format.description }), alternates: { canonical: localePath(locale, path), languages: alternateLanguages(path) } };
}

export default async function FormatPage({ params }: { params: Promise<{ locale: string; extension: string }> }) {
  const { locale, extension } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  const format = getFormat(extension, locale);
  if (!format) notFound();
  const category = getCategory(format.category, locale) ?? getCategory(categories[0].slug, locale)!;
  return <>
    <section className="bg-background py-14 sm:py-20"><div className="content-shell flex flex-col gap-10">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale)} />}>{dictionary.common.home}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale, `/categories/${category.slug}`)} />}>{category.name}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{format.name}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-center"><div className="flex flex-col items-start gap-6"><Badge variant="secondary">.{format.extension} · {format.native ? dictionary.format.browserNativeView : dictionary.format.pluginView}</Badge><div className="flex flex-col gap-4"><h1 className="display-title text-5xl leading-none sm:text-6xl">{interpolate(dictionary.format.headline, { name: format.name })}</h1><p className="max-w-2xl text-xl leading-8 text-muted-foreground">{format.description}{dictionary.format.privacySuffix}</p></div><Button nativeButton={false} size="lg" render={<IsolationBoundaryLink href={localePath(locale, "/view")} />}>{interpolate(dictionary.format.choose, { extension: format.extension })}<ArrowRightIcon data-icon="inline-end" /></Button></div><FormatGlyph category={format.category} extension={format.extension} /></div>
    </div></section>
    <section className="bg-foreground py-16 text-background sm:py-20"><div className="content-shell grid gap-8 sm:grid-cols-3">{dictionary.format.benefits.map(({ title, description }, index) => { const Icon = benefitIcons[index]; return <div key={title} className="flex flex-col gap-4"><Icon className="size-6 text-primary" aria-hidden="true" /><div className="flex flex-col gap-2"><h2 className="text-xl font-semibold">{title}</h2><p className="leading-7 opacity-65">{description}</p></div></div>; })}</div></section>
  </>;
}
