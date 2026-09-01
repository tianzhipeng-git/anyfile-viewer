import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRightIcon, CheckIcon, CircleAlertIcon, LockKeyholeIcon } from "lucide-react";

import { JsonLd } from "@/components/json-ld";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategory, getFormat, getPlugin, publishedFormatRoutes, publishedFormats } from "@/content";
import { alternateLanguages, isPublishedLocale, localePath, siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";

export const dynamicParams = false;
export function generateStaticParams() { return publishedFormatRoutes.map((extension) => ({ extension })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string; extension: string }> }): Promise<Metadata> {
  const { locale, extension } = await params;
  if (!isPublishedLocale(locale)) return {};
  const format = getFormat(extension, locale);
  if (!format) return {};
  const dictionary = await getDictionary(locale);
  const path = `/formats/${format.extension}`;
  return { title: format.title, description: `${format.description}${dictionary.format.privacySuffix}`, alternates: { canonical: localePath(locale, path), languages: alternateLanguages(path) } };
}

export default async function FormatPage({ params }: { params: Promise<{ locale: string; extension: string }> }) {
  const { locale, extension } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  const format = getFormat(extension, locale);
  if (!format) notFound();
  if (extension.toLowerCase() !== format.extension) permanentRedirect(localePath(locale, `/formats/${format.extension}`));
  const category = getCategory(format.categoryId, locale);
  if (!category) notFound();
  const plugins = format.pluginIds.map((id) => getPlugin(id, locale)).filter((item) => item !== undefined);
  const related = publishedFormats
    .filter((item) => item.categoryId === format.categoryId && item.extension !== format.extension)
    .slice(0, 4).map((item) => getFormat(item.extension, locale)!);
  const absolute = (path: string) => new URL(localePath(locale, path), siteUrl()).toString();
  const levelLabel = locale === "zh-CN" ? `典型支持等级 ${format.capability.typicalLevel}` : `Typical support level ${format.capability.typicalLevel}`;

  return <>
    <JsonLd value={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: dictionary.common.home, item: absolute("/") },
      { "@type": "ListItem", position: 2, name: category.name, item: absolute(`/categories/${category.slug}`) },
      { "@type": "ListItem", position: 3, name: format.name, item: absolute(`/formats/${format.extension}`) },
    ] }} />
    <JsonLd value={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: format.faq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />
    <section className="bg-background py-14 sm:py-20"><div className="content-shell flex flex-col gap-10">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale)} />}>{dictionary.common.home}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale, `/categories/${category.slug}`)} />}>{category.name}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{format.name}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="grid gap-10 lg:grid-cols-[1fr_0.55fr] lg:items-end"><div className="flex max-w-3xl flex-col items-start gap-6">
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">.{format.extension}</Badge><Badge variant="outline">{levelLabel}</Badge></div>
        <h1 className="display-title text-5xl leading-none sm:text-6xl">{format.title}</h1>
        <p className="text-xl leading-8 text-muted-foreground">{format.introduction}</p>
        <Button nativeButton={false} size="lg" render={<IsolationBoundaryLink href={localePath(locale, "/view")} />}>{locale === "zh-CN" ? `选择 .${format.extension} 文件` : `Choose a .${format.extension} file`}<ArrowRightIcon data-icon="inline-end" /></Button>
      </div><div className="rounded-2xl border bg-muted p-6"><LockKeyholeIcon className="mb-4 size-7 text-primary" aria-hidden="true" /><h2 className="mb-2 text-lg font-semibold">{locale === "zh-CN" ? "文件留在当前设备" : "Your file stays on this device"}</h2><p className="leading-7 text-muted-foreground">{locale === "zh-CN" ? "Anyfile 只读取你明确选择的本地文件。解析、解码与渲染发生在当前浏览器标签页，不上传到 Anyfile 服务器。" : "Anyfile reads only the local file you select. Parsing, decoding and rendering happen in this browser tab; the file is not uploaded to Anyfile servers."}</p></div></div>
    </div></section>
    <section className="bg-muted py-16 sm:py-20"><div className="content-shell grid gap-12 lg:grid-cols-2">
      <div><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "可以查看什么" : "What Anyfile can show"}</h2><ul className="space-y-4">{format.canShow.map((item) => <li key={item} className="flex gap-3"><CheckIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><span className="leading-7">{item}</span></li>)}</ul></div>
      <div><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "限制与条件" : "Limits and conditions"}</h2><ul className="space-y-4">{[...(format.capability.conditions?.[locale] ?? []), ...format.limitations].map((item) => <li key={item} className="flex gap-3"><CircleAlertIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><span className="leading-7">{item}</span></li>)}</ul>{format.alternatives && <div className="mt-8 rounded-xl border bg-background p-5"><h3 className="font-semibold">{locale === "zh-CN" ? "需要更完整能力？" : "Need deeper capabilities?"}</h3>{format.alternatives.map((alternative) => <p className="mt-3 leading-7 text-muted-foreground" key={alternative.name}><a className="font-semibold text-primary" href={alternative.url} rel="noreferrer">{alternative.name}</a> — {alternative.reason[locale]}</p>)}<p className="mt-3 text-xs text-muted-foreground">{locale === "zh-CN" ? "独立建议，与 Anyfile 无合作或背书关系。" : "Independent suggestion; no partnership or endorsement is implied."}</p></div>}</div>
    </div></section>
    <section className="bg-background py-16 sm:py-20"><div className="content-shell grid gap-12 lg:grid-cols-[1fr_0.7fr]">
      <div><p className="mb-2 text-sm font-semibold text-primary">{locale === "zh-CN" ? "实现透明度" : "IMPLEMENTATION"}</p><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "负责此格式的查看器" : "Viewers responsible for this format"}</h2><div className="grid gap-4 sm:grid-cols-2">{plugins.map((plugin) => <Card key={plugin.pluginId}><CardHeader><CardTitle>{plugin.manifest.name[locale] ?? plugin.manifest.name.en}</CardTitle><CardDescription>{plugin.description}</CardDescription><Link className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary" href={localePath(locale, `/plugins/${plugin.pluginId}`)}>{locale === "zh-CN" ? "查看实现与开源依赖" : "See implementation and open-source credits"}<ArrowRightIcon className="size-4" /></Link></CardHeader></Card>)}</div></div>
      <div><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "常见问题" : "Common question"}</h2>{format.faq.map(({ question, answer }) => <div key={question} className="border-t py-5 first:border-t-0 first:pt-0"><h3 className="font-semibold">{question}</h3><p className="mt-2 leading-7 text-muted-foreground">{answer}</p></div>)}</div>
    </div></section>
    {related.length > 0 && <section className="bg-foreground py-16 text-background"><div className="content-shell"><h2 className="display-title mb-8 text-3xl">{locale === "zh-CN" ? "相关格式" : "Related formats"}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{related.map((item) => <Link className="rounded-xl border border-background/20 p-5 transition-colors hover:bg-background/10" key={item.extension} href={localePath(locale, `/formats/${item.extension}`)}><span className="text-xs opacity-60">.{item.extension}</span><span className="mt-2 block font-semibold">{item.name}</span></Link>)}</div></div></section>}
  </>;
}
