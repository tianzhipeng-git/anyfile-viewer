import { ArrowUpRightIcon } from "lucide-react";

import { AnalyticsPreferences } from "@/components/google-analytics";
import { BrandMark } from "@/components/brand-mark";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Separator } from "@/components/ui/separator";
import { localePath, type PublishedLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";

const linkClassName = "inline-flex min-h-9 items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export function SiteFooter({ locale, dictionary }: { locale: PublishedLocale; dictionary: AppDictionary }) {
  const copy = locale === "zh-CN" ? {
    tagline: "文件留在本地，查看就在浏览器。",
    help: "帮助与反馈",
    integrations: "网站集成",
    navigation: "页脚导航",
  } : {
    tagline: "Open files in your browser. Keep them on your device.",
    help: "Help & feedback",
    integrations: "Integrations",
    navigation: "Footer navigation",
  };

  return (
    <footer className="border-t bg-background">
      <div className="content-shell">
        <div className="flex flex-col gap-5 py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex flex-col items-start gap-3">
            <IsolationBoundaryLink href={localePath(locale)} aria-label={`Anyfile ${dictionary.common.home}`} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              <BrandMark />
            </IsolationBoundaryLink>
            <p className="text-sm leading-6 text-muted-foreground">{copy.tagline}</p>
          </div>
          <nav aria-label={copy.navigation}>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground sm:gap-x-8">
              <li><IsolationBoundaryLink href={localePath(locale, "/about")} className={linkClassName}>{dictionary.common.about}</IsolationBoundaryLink></li>
              <li><IsolationBoundaryLink href={localePath(locale, "/contact")} className={linkClassName}>{copy.help}</IsolationBoundaryLink></li>
              <li><IsolationBoundaryLink href={localePath(locale, "/integrations")} className={linkClassName}>{copy.integrations}</IsolationBoundaryLink></li>
              <li><a href="https://github.com/tianzhipeng-git/anyfile-viewer" rel="noreferrer" target="_blank" className={linkClassName}>GitHub<ArrowUpRightIcon className="size-3.5" aria-hidden="true" /></a></li>
            </ul>
          </nav>
        </div>
        <Separator />
        <div className="flex flex-col gap-1 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p>{dictionary.common.copyright}</p>
          <div className="flex flex-wrap items-center gap-x-5 [&>button]:min-h-9 [&>button]:rounded-sm [&>button]:focus-visible:outline-2 [&>button]:focus-visible:outline-offset-4 [&>button]:focus-visible:outline-ring">
            <IsolationBoundaryLink href={localePath(locale, "/privacy")} className={linkClassName}>{dictionary.common.privacy}</IsolationBoundaryLink>
            <AnalyticsPreferences locale={locale} />
          </div>
        </div>
      </div>
    </footer>
  );
}
