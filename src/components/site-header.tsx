import { ArrowUpRightIcon } from "lucide-react";

import { getCategory } from "@/content";
import { SiteNavigation } from "@/components/site-navigation";

import { BrandMark } from "@/components/brand-mark";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { localePath, type PublishedLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";

export function SiteHeader({ locale, dictionary }: { locale: PublishedLocale; dictionary: AppDictionary }) {
  const groups = [
    { label: dictionary.nav.media, categories: [["images-video", "JPG · PNG · MP4 · MP3"], ["360-cameras", "INSV · INSP · 360 · OSV"]] },
    { label: dictionary.nav.reading, categories: [["documents", "PDF · DOCX · XLSX · PPTX"], ["ebooks", "EPUB · MOBI · FB2 · CBZ"]] },
    { label: dictionary.nav.designEngineering, categories: [["graphic-design", "PSD · PSB · AI · PXD"], ["3d-models", "GLB · glTF · OBJ · STL"], ["engineering", "DWG · DXF · STEP · IGES"]] },
    { label: dictionary.nav.dataDevelopment, categories: [["code-data", "CSV · JSON · Parquet · SQLite"], ["developer-artifacts", "TXT · XML · WASM · NPY"]] },
  ].map(({ label, categories }) => ({
    label,
    links: categories.map(([slug, formats]) => ({
      href: localePath(locale, `/categories/${slug}`),
      label: getCategory(slug, locale)!.name,
      formats,
    })),
  }));
  return (
    <header className="sticky top-0 z-20 border-b border-background/10 bg-foreground text-background">
      <div className="content-shell flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 lg:flex-nowrap lg:py-0">
        <IsolationBoundaryLink href={localePath(locale)} aria-label={`Anyfile ${dictionary.common.home}`}><BrandMark /></IsolationBoundaryLink>
        <div className="order-last flex w-full justify-center lg:order-none lg:w-auto">
          <SiteNavigation groups={groups} label={dictionary.common.mainNavigation} categoriesLabel={dictionary.common.categories} />
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} label={dictionary.common.language} />
          <Button nativeButton={false} size="sm" render={<IsolationBoundaryLink href={localePath(locale, "/view")} />}>
            {dictionary.common.openFile}
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </header>
  );
}
