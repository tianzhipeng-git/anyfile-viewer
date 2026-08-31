import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";

import { FormatGlyph } from "@/components/format-glyph";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { alternateLanguages, isPublishedLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { categories, getCategory, getCategoryFormats } from "@/lib/catalog";

export function generateStaticParams() { return categories.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isPublishedLocale(locale)) return {};
  const category = getCategory(slug, locale);
  if (!category) return {};
  const path = `/categories/${slug}`;
  return { title: category.name, description: category.description, alternates: { canonical: localePath(locale, path), languages: alternateLanguages(path) } };
}

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  const category = getCategory(slug, locale);
  if (!category) notFound();
  const categoryFormats = getCategoryFormats(category.slug, locale);
  return <>
    <section className="bg-background py-14 sm:py-20"><div className="content-shell flex flex-col gap-10">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale)} />}>{dictionary.category.home}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{category.name}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="flex max-w-3xl flex-col gap-5"><p className="text-sm font-semibold text-primary">{category.eyebrow}</p><h1 className="display-title text-5xl sm:text-6xl">{category.name}{dictionary.category.viewerSuffix}</h1><p className="text-xl leading-8 text-muted-foreground">{category.description}{dictionary.category.localSuffix}</p></div>
    </div></section>
    <section className="bg-muted py-16 sm:py-20"><div className="content-shell flex flex-col gap-8">
      <div className="flex items-end justify-between gap-6"><div className="flex flex-col gap-2"><p className="text-sm font-semibold text-primary">{categoryFormats.length} {dictionary.category.formats}</p><h2 className="display-title text-3xl sm:text-4xl">{dictionary.category.choose}</h2></div><Button nativeButton={false} variant="outline" render={<IsolationBoundaryLink href={localePath(locale, "/view")} />}>{dictionary.common.directOpen}</Button></div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{categoryFormats.map((format) => <Card key={format.extension}><CardContent><FormatGlyph category={format.category} extension={format.extension} /></CardContent><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{format.name}</CardTitle><Badge variant={format.native ? "secondary" : "outline"}>{format.native ? dictionary.common.native : dictionary.common.plugin}</Badge></div><CardDescription>{format.description}</CardDescription></CardHeader><CardFooter><Button nativeButton={false} variant="link" render={<Link href={localePath(locale, `/formats/${format.extension}`)} />}>{dictionary.common.learnAndOpen}<ArrowRightIcon data-icon="inline-end" /></Button></CardFooter></Card>)}</div>
    </div></section>
  </>;
}
