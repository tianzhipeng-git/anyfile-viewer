import { BrandMark } from "@/components/brand-mark";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Separator } from "@/components/ui/separator";
import { getCategories } from "@/lib/catalog";
import { localePath, type PublishedLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";

export function SiteFooter({ locale, dictionary }: { locale: PublishedLocale; dictionary: AppDictionary }) {
  const categories = getCategories(locale);
  return (
    <footer className="bg-muted py-14">
      <div className="content-shell flex flex-col gap-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <div className="flex max-w-md flex-col gap-4">
            <BrandMark />
            <p className="text-sm leading-6 text-muted-foreground">{dictionary.common.footerPrivacy}</p>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <p className="font-semibold">{dictionary.common.categories}</p>
            {categories.slice(0, 3).map((category) => (
              <IsolationBoundaryLink key={category.slug} href={localePath(locale, `/categories/${category.slug}`)} className="text-muted-foreground hover:text-foreground">{category.name}</IsolationBoundaryLink>
            ))}
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <p className="font-semibold">{dictionary.common.getStarted}</p>
            <IsolationBoundaryLink href={localePath(locale, "/view")} className="text-muted-foreground hover:text-foreground">{dictionary.common.openFile}</IsolationBoundaryLink>
            <IsolationBoundaryLink href={localePath(locale, "/formats/pdf")} className="text-muted-foreground hover:text-foreground">PDF {dictionary.format.viewerSuffix}</IsolationBoundaryLink>
            <IsolationBoundaryLink href={localePath(locale, "/formats/json")} className="text-muted-foreground hover:text-foreground">JSON {dictionary.format.viewerSuffix}</IsolationBoundaryLink>
          </div>
        </div>
        <Separator />
        <p className="text-xs text-muted-foreground">{dictionary.common.copyright}</p>
      </div>
    </footer>
  );
}
