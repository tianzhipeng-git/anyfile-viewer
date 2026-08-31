import { ArrowRightIcon, FolderOpenIcon, LockKeyholeIcon, ZapIcon } from "lucide-react";

import { CategoryCard } from "@/components/category-card";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Button } from "@/components/ui/button";
import { isPublishedLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { getCategories } from "@/lib/catalog";

const principleIcons = [LockKeyholeIcon, ZapIcon, FolderOpenIcon];

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: candidate } = await params;
  if (!isPublishedLocale(candidate)) return null;
  const dictionary = await getDictionary(candidate);
  const categories = getCategories(candidate);

  return (
    <>
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
        </div>
      </section>
    </>
  );
}
