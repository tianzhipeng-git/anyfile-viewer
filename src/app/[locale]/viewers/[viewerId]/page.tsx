import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, CheckIcon, CircleAlertIcon, FileVideoIcon, MonitorPlayIcon } from "lucide-react";

import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getPanoramaViewer, getPanoramaViewers, publishedPanoramaViewers } from "@/content";
import { isPublishedLocale, localePath, siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { localizedPageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return publishedPanoramaViewers.map(({ viewerId }) => ({ viewerId }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; viewerId: string }> }): Promise<Metadata> {
  const { locale, viewerId } = await params;
  if (!isPublishedLocale(locale)) return {};
  const viewer = getPanoramaViewer(viewerId, locale);
  if (!viewer) return {};
  return localizedPageMetadata({ locale, path: `/viewers/${viewerId}`, title: viewer.title, description: viewer.description });
}

export default async function PanoramaViewerPage({ params }: { params: Promise<{ locale: string; viewerId: string }> }) {
  const { locale, viewerId } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const viewer = getPanoramaViewer(viewerId, locale);
  if (!viewer) notFound();
  const dictionary = await getDictionary(locale);
  const relatedViewers = getPanoramaViewers(locale).filter((item) => item.viewerId !== viewerId);
  const absolute = (path: string) => new URL(localePath(locale, path), siteUrl()).toString();
  const categoryLabel = locale === "zh-CN" ? "360° 全景" : "360° Cameras";

  return <>
    <JsonLd value={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: dictionary.common.home, item: absolute("/") },
      { "@type": "ListItem", position: 2, name: categoryLabel, item: absolute("/categories/360-cameras") },
      { "@type": "ListItem", position: 3, name: viewer.name, item: absolute(`/viewers/${viewerId}`) },
    ] }} />
    <JsonLd value={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: viewer.faq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />

    <section className="bg-background py-14 sm:py-20"><div className="content-shell flex flex-col gap-10">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale)} />}>{dictionary.common.home}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale, "/categories/360-cameras")} />}>{categoryLabel}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{viewer.name}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="flex max-w-4xl flex-col items-start gap-6">
        <p className="text-sm font-semibold text-primary">{viewer.eyebrow}</p>
        <h1 className="display-title text-5xl leading-none sm:text-6xl">{viewer.title}</h1>
        <p className="max-w-3xl text-xl leading-8 text-muted-foreground">{viewer.introduction}</p>
        <div className="flex flex-wrap gap-2">{viewer.formatExtensions.map((extension) => <Badge key={extension} variant="secondary">.{extension}</Badge>)}</div>
        <IsolationBoundaryLink className={cn(buttonVariants({ size: "lg" }))} href={localePath(locale, "/view")}>
          {viewer.openLabel}<ArrowRightIcon data-icon="inline-end" />
        </IsolationBoundaryLink>
      </div>
    </div></section>

    <section className="bg-foreground py-16 text-background"><div className="content-shell grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
      <div><MonitorPlayIcon className="mb-4 size-7 text-primary" aria-hidden="true" /><h2 className="display-title text-3xl">{locale === "zh-CN" ? "已验证机型" : "Verified cameras"}</h2><div className="mt-6 flex flex-wrap gap-2">{viewer.models.map((model) => <Badge className="border-background/20 text-background" key={model} variant="outline">{model}</Badge>)}</div></div>
      <div><h2 className="display-title text-3xl">{locale === "zh-CN" ? "可以查看什么" : "What you can view"}</h2><ul className="mt-6 flex flex-col gap-4">{viewer.highlights.map((item) => <li className="flex gap-3" key={item}><CheckIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><span className="leading-7 opacity-80">{item}</span></li>)}</ul></div>
    </div></section>

    <section className="bg-muted py-16 sm:py-20"><div className="content-shell flex flex-col gap-8">
      <div><p className="text-sm font-semibold text-primary">{locale === "zh-CN" ? "支持范围" : "SUPPORTED ORIGINALS"}</p><h2 className="display-title mt-2 text-3xl sm:text-4xl">{locale === "zh-CN" ? "相机格式与实际能力" : "Camera formats and actual capabilities"}</h2></div>
      <div className="grid gap-5 md:grid-cols-2">{viewer.formats.map((format) => <Card key={format.extension}><CardHeader><div className="mb-3 flex items-center gap-3"><FileVideoIcon className="size-6 text-primary" aria-hidden="true" /><Badge variant="outline">.{format.extension}</Badge></div><CardTitle>{format.label}</CardTitle><CardDescription className="leading-6">{format.description}</CardDescription></CardHeader><CardFooter><Link className="inline-flex items-center gap-2 font-semibold text-primary" href={localePath(locale, `/formats/${format.extension}`)}>{locale === "zh-CN" ? "查看格式详情" : "See format details"}<ArrowRightIcon className="size-4" /></Link></CardFooter></Card>)}</div>
    </div></section>

    <section className="bg-background py-16 sm:py-20"><div className="content-shell grid gap-12 lg:grid-cols-2">
      <div><h2 className="display-title text-3xl">{locale === "zh-CN" ? "如何打开" : "How to open it"}</h2><ol className="mt-7 flex flex-col gap-5">{viewer.openingSteps.map((item, index) => <li className="flex gap-4" key={item}><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{index + 1}</span><span className="pt-1 leading-7">{item}</span></li>)}</ol></div>
      <div><h2 className="display-title text-3xl">{locale === "zh-CN" ? "浏览器要求" : "Browser requirements"}</h2><ul className="mt-7 flex flex-col gap-5">{viewer.requirements.map((item) => <li className="flex gap-3" key={item}><CircleAlertIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><span className="leading-7 text-muted-foreground">{item}</span></li>)}</ul></div>
    </div></section>

    <section className="bg-muted py-16"><div className="content-shell grid gap-12 lg:grid-cols-[1fr_0.8fr]">
      <div><h2 className="display-title text-3xl">{locale === "zh-CN" ? "明确的能力边界" : "Clear capability boundaries"}</h2><ul className="mt-6 flex flex-col gap-4">{viewer.limitations.map((item) => <li className="flex gap-3" key={item}>— <span className="leading-7 text-muted-foreground">{item}</span></li>)}</ul><Link className="mt-7 inline-flex items-center gap-2 font-semibold text-primary" href={localePath(locale, `/plugins/${viewer.pluginId}`)}>{locale === "zh-CN" ? "查看技术实现与开源依赖" : "See implementation and open-source credits"}<ArrowRightIcon className="size-4" /></Link></div>
      <div><h2 className="display-title text-3xl">{locale === "zh-CN" ? "常见问题" : "Frequently asked questions"}</h2><div className="mt-5 flex flex-col">{viewer.faq.map(({ question, answer }) => <div className="border-t py-5 first:border-0" key={question}><h3 className="font-semibold">{question}</h3><p className="mt-2 leading-7 text-muted-foreground">{answer}</p></div>)}</div></div>
    </div></section>

    <section className="bg-foreground py-16 text-background"><div className="content-shell"><h2 className="display-title text-3xl">{locale === "zh-CN" ? "其他全景相机查看器" : "Other 360° camera viewers"}</h2><div className="mt-8 grid gap-4 md:grid-cols-2">{relatedViewers.map((item) => <Link className="rounded-xl border border-background/20 p-5 transition-colors hover:bg-background/10" href={localePath(locale, `/viewers/${item.viewerId}`)} key={item.viewerId}><span className="font-semibold">{item.name}</span><span className="mt-2 block text-sm leading-6 opacity-65">{item.description}</span></Link>)}</div></div></section>
  </>;
}
