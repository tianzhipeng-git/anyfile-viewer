import { ArrowUpRightIcon } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/categories/images-video", label: "图片与视频" },
  { href: "/categories/documents", label: "文档" },
  { href: "/categories/code-data", label: "代码与数据" },
  { href: "/categories/3d", label: "3D" },
  { href: "/categories/design", label: "设计" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-background/10 bg-foreground text-background">
      <div className="content-shell flex h-12 items-center justify-between gap-6">
        <IsolationBoundaryLink href="/" aria-label="Anyfile 首页"><BrandMark /></IsolationBoundaryLink>
        <nav className="hidden items-center gap-6 text-xs md:flex" aria-label="主要导航">
          {links.map((link) => (
            <IsolationBoundaryLink key={link.href} href={link.href} className="opacity-75 transition-opacity hover:opacity-100">{link.label}</IsolationBoundaryLink>
          ))}
        </nav>
        <Button nativeButton={false} size="sm" render={<IsolationBoundaryLink href="/view" />}>
          打开文件
          <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </header>
  );
}
