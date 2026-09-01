import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, CircleAlertIcon, SparklesIcon } from "lucide-react";

import { FormatGlyph } from "@/components/format-glyph";
import { JsonLd } from "@/components/json-ld";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategory, getCategoryFormats, publishedCategories } from "@/content";
import { alternateLanguages, isPublishedLocale, localePath, siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";

export const dynamicParams = false;
export function generateStaticParams() { return publishedCategories.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isPublishedLocale(locale)) return {};
  const category = getCategory(slug, locale);
  if (!category) return {};
  const dictionary = await getDictionary(locale);
  const path = `/categories/${slug}`;
  return { title: category.title, description: `${category.description}${dictionary.category.localSuffix}`, alternates: { canonical: localePath(locale, path), languages: alternateLanguages(path) } };
}

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  const category = getCategory(slug, locale);
  if (!category) notFound();
  const formats = getCategoryFormats(slug, locale);
  const absolute = (path: string) => new URL(localePath(locale, path), siteUrl()).toString();
  return <>
    <JsonLd value={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: dictionary.common.home, item: absolute("/") }, { "@type": "ListItem", position: 2, name: category.name, item: absolute(`/categories/${slug}`) }] }} />
    <JsonLd value={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: category.faq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />
    <section className="bg-background py-14 sm:py-20"><div className="content-shell flex flex-col gap-10">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale)} />}>{dictionary.common.home}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{category.name}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="max-w-4xl"><p className="mb-4 text-sm font-semibold text-primary">{category.eyebrow}</p><h1 className="display-title text-5xl sm:text-6xl">{category.title}</h1><p className="mt-6 text-xl leading-8 text-muted-foreground">{category.introduction}</p></div>
    </div></section>
    <section className="bg-foreground py-16 text-background"><div className="content-shell grid gap-10 md:grid-cols-2"><div><SparklesIcon className="mb-4 size-6 text-primary" /><h2 className="display-title mb-5 text-3xl">{locale === "zh-CN" ? "典型用途" : "Typical uses"}</h2><ul className="space-y-3 opacity-80">{category.useCases.map((item) => <li key={item}>— {item}</li>)}</ul></div><div><CircleAlertIcon className="mb-4 size-6 text-primary" /><h2 className="display-title mb-5 text-3xl">{locale === "zh-CN" ? "常见打不开原因" : "Common reasons files do not open"}</h2><ul className="space-y-3 opacity-80">{category.commonProblems.map((item) => <li key={item}>— {item}</li>)}</ul></div></div></section>
    <section className="bg-muted py-16 sm:py-20"><div className="content-shell flex flex-col gap-8">
      <div className="flex items-end justify-between gap-6"><div><p className="text-sm font-semibold text-primary">{formats.length} {dictionary.category.formats}</p><h2 className="display-title mt-2 text-3xl sm:text-4xl">{dictionary.category.choose}</h2></div><Button nativeButton={false} variant="outline" render={<IsolationBoundaryLink href={localePath(locale, "/view")} />}>{dictionary.common.directOpen}</Button></div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{formats.map((format) => <Card key={format.extension}><CardContent><FormatGlyph category={format.categoryId} extension={format.extension} /></CardContent><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle>{format.name}</CardTitle><Badge variant="outline">L{format.capability.typicalLevel}</Badge></div><CardDescription>{format.description}</CardDescription></CardHeader><CardFooter><Button nativeButton={false} variant="link" render={<Link href={localePath(locale, `/formats/${format.extension}`)} />}>{dictionary.common.learnAndOpen}<ArrowRightIcon data-icon="inline-end" /></Button></CardFooter></Card>)}</div>
    </div></section>
    <section className="bg-background py-16"><div className="content-shell max-w-3xl"><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "类别常见问题" : "Category FAQ"}</h2>{category.faq.map(({ question, answer }) => <div key={question} className="border-t py-5 first:border-0"><h3 className="font-semibold">{question}</h3><p className="mt-2 leading-7 text-muted-foreground">{answer}</p></div>)}</div></section>
  </>;
}
