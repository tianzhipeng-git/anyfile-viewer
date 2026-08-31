import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, BoxIcon, CircleAlertIcon, GitBranchIcon, NetworkIcon } from "lucide-react";

import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlugin, publishedPlugins } from "@/content";
import { alternateLanguages, isPublishedLocale, localePath, siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";

export const dynamicParams = false;
export function generateStaticParams() { return publishedPlugins.map(({ pluginId }) => ({ pluginId })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string; pluginId: string }> }): Promise<Metadata> {
  const { locale, pluginId } = await params;
  if (!isPublishedLocale(locale)) return {};
  const plugin = getPlugin(pluginId, locale);
  if (!plugin) return {};
  const path = `/plugins/${pluginId}`;
  return { title: plugin.title, description: plugin.description, alternates: { canonical: localePath(locale, path), languages: alternateLanguages(path) } };
}

export default async function PluginPage({ params }: { params: Promise<{ locale: string; pluginId: string }> }) {
  const { locale, pluginId } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  const plugin = getPlugin(pluginId, locale);
  if (!plugin) notFound();
  const name = plugin.manifest.name[locale] ?? plugin.manifest.name.en;
  const pageUrl = new URL(localePath(locale, `/plugins/${pluginId}`), siteUrl()).toString();

  return <>
    <JsonLd value={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: dictionary.common.home, item: new URL(localePath(locale), siteUrl()).toString() },
      { "@type": "ListItem", position: 2, name, item: pageUrl },
    ] }} />
    <section className="bg-background py-14 sm:py-20"><div className="content-shell flex flex-col gap-10">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link href={localePath(locale)} />}>{dictionary.common.home}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{name}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="max-w-4xl"><div className="mb-5 flex flex-wrap gap-2"><Badge variant="secondary">{plugin.pluginId}</Badge><Badge variant="outline">protocol v{plugin.manifest.protocolVersion}</Badge><Badge variant="outline">workspace: {plugin.manifest.workspaceAccess}</Badge></div><h1 className="display-title text-5xl leading-none sm:text-6xl">{plugin.title}</h1><p className="mt-6 text-xl leading-8 text-muted-foreground">{plugin.summary}</p></div>
    </div></section>
    <section className="bg-foreground py-16 text-background"><div className="content-shell grid gap-12 lg:grid-cols-2">
      <div><NetworkIcon className="mb-4 size-7 text-primary" /><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "查看流程" : "Viewing architecture"}</h2><ol className="space-y-5">{plugin.architecture.map((item, index) => <li className="flex gap-4" key={item}><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background/10 text-sm">{index + 1}</span><span className="leading-7 opacity-80">{item}</span></li>)}</ol></div>
      <div><CircleAlertIcon className="mb-4 size-7 text-primary" /><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "主要限制" : "Main limitations"}</h2><ul className="space-y-5">{plugin.limitations.map((item) => <li className="flex gap-3 leading-7 opacity-80" key={item}>— {item}</li>)}</ul></div>
    </div></section>
    <section className="bg-muted py-16 sm:py-20"><div className="content-shell"><p className="mb-2 text-sm font-semibold text-primary">MANIFEST</p><h2 className="display-title mb-8 text-3xl">{locale === "zh-CN" ? "实际声明的格式" : "Formats declared by the plugin"}</h2><div className="grid gap-5 md:grid-cols-2">{plugin.manifest.formats.map((format) => <Card key={`${format.name.en}-${format.extensions.join()}`}><CardHeader><CardTitle>{format.name[locale] ?? format.name.en}</CardTitle><CardDescription className="flex flex-wrap gap-2 pt-3">{format.extensions.map((extension) => <Badge key={extension} variant="outline">{extension}</Badge>)}</CardDescription></CardHeader></Card>)}</div></div></section>
    <section className="bg-background py-16 sm:py-20"><div className="content-shell grid gap-12 lg:grid-cols-[1fr_0.8fr]">
      <div><GitBranchIcon className="mb-4 size-7 text-primary" /><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "开源项目与许可证" : "Open-source projects and licenses"}</h2>{plugin.upstreamProjects.length > 0 ? <div className="space-y-5">{plugin.upstreamProjects.map((project) => <div className="rounded-xl border p-5" key={`${project.name}-${project.version}`}><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold"><a className="hover:text-primary" href={project.projectUrl} rel="noreferrer">{project.name}</a> <span className="font-mono text-xs text-muted-foreground">{project.version}</span></h3><Badge variant="outline">{project.license}</Badge></div><p className="mt-3 leading-7 text-muted-foreground">{project.usage[locale]}</p>{project.noticeUrl && <a className="mt-3 inline-block text-sm font-semibold text-primary" href={project.noticeUrl}>{locale === "zh-CN" ? "查看分发许可证文本" : "Read distributed license text"}</a>}</div>)}</div> : <p className="leading-7 text-muted-foreground">{locale === "zh-CN" ? "此查看器的核心格式逻辑由 Anyfile 项目实现；本页没有需要单独列出的外部运行时项目。完整分发义务仍以仓库许可证与 third-party notices 为准。" : "This viewer's core format logic is implemented within the Anyfile project; there is no separately credited external runtime project for this page. Repository licenses and third-party notices remain authoritative."}</p>}</div>
      <div><BoxIcon className="mb-4 size-7 text-primary" /><h2 className="display-title mb-6 text-3xl">{locale === "zh-CN" ? "已发布格式页" : "Published format pages"}</h2>{plugin.formats.length > 0 ? <div className="space-y-3">{plugin.formats.map((format) => <Link className="flex items-center justify-between rounded-xl border p-4 transition-colors hover:bg-muted" href={localePath(locale, `/formats/${format.extension}`)} key={format.extension}><span><span className="font-semibold">{format.name}</span><span className="ml-2 text-xs text-muted-foreground">.{format.extension}</span></span><ArrowRightIcon className="size-4" /></Link>)}</div> : <p className="leading-7 text-muted-foreground">{locale === "zh-CN" ? "此插件目前没有独立发布的格式落地页。Manifest 能力仍可在查看页使用。" : "This plugin currently has no separately published format landing page. Its Manifest capability remains available in the viewer."}</p>}</div>
    </div></section>
  </>;
}
