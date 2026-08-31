import { ArrowUpRightIcon } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { localePath, type PublishedLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";

export function SiteHeader({ locale, dictionary }: { locale: PublishedLocale; dictionary: AppDictionary }) {
  const links = [
    { href: "/categories/images-video", label: dictionary.nav.imagesVideo },
    { href: "/categories/documents", label: dictionary.nav.documents },
    { href: "/categories/code-data", label: dictionary.nav.codeData },
    { href: "/categories/developer-artifacts", label: dictionary.nav.developerArtifacts },
  ];
  return (
    <header className="sticky top-0 z-20 border-b border-background/10 bg-foreground text-background">
      <div className="content-shell flex h-12 items-center justify-between gap-6">
        <IsolationBoundaryLink href={localePath(locale)} aria-label={`Anyfile ${dictionary.common.home}`}><BrandMark /></IsolationBoundaryLink>
        <nav className="hidden items-center gap-6 text-xs md:flex" aria-label={dictionary.common.mainNavigation}>
          {links.map((link) => (
            <IsolationBoundaryLink key={link.href} href={localePath(locale, link.href)} className="opacity-75 transition-opacity hover:opacity-100">{link.label}</IsolationBoundaryLink>
          ))}
        </nav>
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
