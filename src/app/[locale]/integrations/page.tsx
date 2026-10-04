import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Button } from "@/components/ui/button";
import { integrationContent } from "@/content/integrations";
import { isPublishedLocale, localePath, siteUrl } from "@/i18n/config";
import { publicFileLinks } from "@/lib/public-file";
import { localizedPageMetadata } from "@/lib/seo";

const example = "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPublishedLocale(locale)) return {};
  const content = integrationContent(locale);
  return localizedPageMetadata({ locale, path: "/integrations", title: content.title, description: content.description });
}

export default async function IntegrationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublishedLocale(locale)) notFound();
  const content = integrationContent(locale);
  const links = publicFileLinks(example, siteUrl().origin, locale);
  const fragment = new URLSearchParams({ file: example }).toString();
  const codes = [[content.link, links.link], [content.markdown, links.markdown], [content.iframe, links.iframe]];
  const sections = [
    [content.parametersTitle, content.parameters, content.versions],
    [content.limitsTitle, content.limits, content.credentials, content.isolation],
    [content.troubleshootingTitle, content.troubleshooting],
    [content.privacyTitle, content.privacy],
  ];
  return <section className="bg-background py-14 sm:py-20">
    <div className="content-shell flex max-w-4xl flex-col gap-10">
      <header className="flex flex-col gap-5">
        <h1 className="display-title text-4xl sm:text-5xl">{content.title}</h1>
        <p className="text-xl leading-8 text-muted-foreground">{content.description}</p>
        <p className="leading-7">{content.intro}</p>
        <Button nativeButton={false} render={<IsolationBoundaryLink href={localePath(locale, "/view")} />} className="self-start">{content.start}</Button>
      </header>
      <section className="flex flex-col gap-4 border-t pt-8">
        <h2 className="text-2xl font-semibold">{content.sourceTitle}</h2>
        <p className="leading-7 text-muted-foreground">{content.source}</p>
        <p className="leading-7 text-muted-foreground">{content.cors}</p>
      </section>
      <section className="flex flex-col gap-4 border-t pt-8">
        <h2 className="text-2xl font-semibold">{content.exampleTitle}</h2>
        <p className="leading-7 text-muted-foreground">{content.example}</p>
        <a href={`${localePath(locale, "/view")}#${fragment}`} className="self-start" aria-label={content.preview}>
          <Image src="/brand/open-in-anyfile.svg" width="156" height="28" alt={content.preview} />
        </a>
        <iframe src={`${localePath(locale, "/embed")}#${fragment}`} title={content.frameTitle} width="100%" height="480" className="rounded-lg border" loading="lazy" allow="fullscreen; cross-origin-isolated" referrerPolicy="no-referrer" />
      </section>
      <section className="flex min-w-0 flex-col gap-4 border-t pt-8">
        <h2 className="text-2xl font-semibold">{content.codeTitle}</h2>
        <p className="leading-7 text-muted-foreground">{content.codeDescription}</p>
        {codes.map(([label, code]) => <div className="flex min-w-0 flex-col gap-2" key={label}>
          <h3 className="font-semibold">{label}</h3>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm"><code>{code}</code></pre>
        </div>)}
      </section>
      {sections.map(([title, ...paragraphs]) => <section className="flex flex-col gap-4 border-t pt-8" key={title}>
        <h2 className="text-2xl font-semibold">{title}</h2>
        {paragraphs.map((paragraph) => <p className="leading-7 text-muted-foreground" key={paragraph}>{paragraph}</p>)}
      </section>)}
    </div>
  </section>;
}
