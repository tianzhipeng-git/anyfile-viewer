import { ArrowRightIcon, CameraIcon, Code2Icon, FolderOpenIcon, GitForkIcon, LockKeyholeIcon, ScaleIcon, ZapIcon } from "lucide-react";
import Link from "next/link";

import { CategoryCard } from "@/components/category-card";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { JsonLd } from "@/components/json-ld";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getPanoramaViewers } from "@/content";
import { isPublishedLocale, localePath, siteUrl } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { getCategories } from "@/lib/catalog";

const principleIcons = [LockKeyholeIcon, ZapIcon, FolderOpenIcon];
const openSourceIcons = [Code2Icon, GitForkIcon, ScaleIcon];

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: candidate } = await params;
  if (!isPublishedLocale(candidate)) return null;
  const dictionary = await getDictionary(candidate);
  const categories = getCategories(candidate);
  const panoramaViewers = getPanoramaViewers(candidate);
  const pageUrl = new URL(localePath(candidate), siteUrl()).toString();

  return (
    <>
      <JsonLd value={{
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", "@id": `${pageUrl}#website`, url: pageUrl, name: "Anyfile", description: dictionary.metadata.siteDescription, inLanguage: candidate },
          {
            "@type": "WebApplication", "@id": `${pageUrl}#application`, name: "Anyfile", url: pageUrl,
            description: dictionary.metadata.siteDescription, applicationCategory: "UtilitiesApplication",
            operatingSystem: "Any operating system with a supported web browser", browserRequirements: "JavaScript and local file access",
            inLanguage: candidate, isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        ],
      }} />
      <section className="bg-background py-24 sm:py-32">
        <div className="content-shell flex max-w-4xl flex-col items-center gap-8 text-center">
          <p className="text-sm font-semibold text-primary">{dictionary.home.localFirst}</p>
          <div className="flex flex-col gap-5">
            <h1 className="display-title text-5xl leading-none sm:text-7xl">{dictionary.home.title}</h1>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-muted-foreground sm:text-2xl">{dictionary.home.description}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button nativeButton={false} size="lg" render={<IsolationBoundaryLink href={localePath(candidate, "/view")} />}>
              {dictionary.home.selectFile}<ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button nativeButton={false} size="lg" variant="outline" render={<a href="#formats" />}>{dictionary.home.browse}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{dictionary.home.trust}</p>
        </div>
      </section>
      <section className="bg-foreground py-20 text-background">
        <div className="content-shell grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-semibold text-primary">{dictionary.home.privacyEyebrow}</p>
            <h2 className="display-title text-4xl leading-tight sm:text-5xl">{dictionary.home.privacyTitle}</h2>
            <p className="max-w-xl text-lg leading-8 opacity-70">{dictionary.home.privacyDescription}</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl bg-background/10 sm:grid-cols-3">
            {dictionary.home.principles.map(({ title, description }, index) => {
              const Icon = principleIcons[index];
              return <div key={title} className="flex flex-col gap-5 bg-foreground p-7"><Icon className="size-7 text-primary" aria-hidden="true" /><div className="flex flex-col gap-2"><h3 className="text-lg font-semibold">{title}</h3><p className="text-sm leading-6 opacity-65">{description}</p></div></div>;
            })}
          </div>
        </div>
      </section>
      <section id="formats" className="bg-muted py-20 sm:py-24">
        <div className="content-shell flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="text-sm font-semibold text-primary">{dictionary.home.formatsEyebrow}</p>
            <h2 className="display-title text-4xl sm:text-5xl">{dictionary.home.formatsTitle}</h2>
            <p className="text-lg leading-7 text-muted-foreground">{dictionary.home.formatsDescription}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => <CategoryCard key={category.slug} category={category} locale={candidate} browseLabel={dictionary.home.browseCount} />)}
          </div>
          <div className="mt-4 flex flex-col gap-8 border-t pt-10">
            <div className="flex max-w-3xl flex-col gap-3">
              <p className="text-sm font-semibold text-primary">{dictionary.home.panoramaEyebrow}</p>
              <h2 className="display-title text-4xl sm:text-5xl">{dictionary.home.panoramaTitle}</h2>
              <p className="text-lg leading-7 text-muted-foreground">{dictionary.home.panoramaDescription}</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {panoramaViewers.map((viewer) => <Card key={viewer.viewerId}><CardHeader><CameraIcon className="mb-3 size-7 text-primary" aria-hidden="true" /><CardTitle>{viewer.name}</CardTitle><CardDescription className="leading-6">{viewer.description}</CardDescription><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{viewer.formatExtensions.map((extension) => <span key={extension}>.{extension}</span>)}</div></CardHeader><CardFooter><Link className="inline-flex items-center gap-2 font-semibold text-primary" href={localePath(candidate, `/viewers/${viewer.viewerId}`)}>{candidate === "zh-CN" ? "查看相机支持" : "Explore camera support"}<ArrowRightIcon className="size-4" /></Link></CardFooter></Card>)}
            </div>
          </div>
        </div>
      </section>
      <section className="bg-foreground py-20 text-background sm:py-24">
        <div className="content-shell flex flex-col gap-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="flex max-w-3xl flex-col gap-4">
              <p className="text-sm font-semibold text-primary">{dictionary.home.openSourceEyebrow}</p>
              <h2 className="display-title text-4xl sm:text-5xl">{dictionary.home.openSourceTitle}</h2>
              <p className="text-lg leading-8 opacity-70">{dictionary.home.openSourceDescription}</p>
            </div>
            <a className={buttonVariants({ variant: "secondary", size: "lg" })} href="https://github.com/tianzhipeng-git/anyfile-viewer" rel="noreferrer" target="_blank">
              {dictionary.home.openSourceCta}<ArrowRightIcon data-icon="inline-end" />
            </a>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl bg-background/10 md:grid-cols-3">
            {dictionary.home.openSourcePrinciples.map(({ title, description }, index) => {
              const Icon = openSourceIcons[index];
              return <div className="flex flex-col gap-4 bg-foreground p-7" key={title}><Icon className="size-7 text-primary" aria-hidden="true" /><h3 className="text-lg font-semibold">{title}</h3><p className="text-sm leading-6 opacity-65">{description}</p></div>;
            })}
          </div>
        </div>
      </section>
    </>
  );
}
