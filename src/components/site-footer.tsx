import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Separator } from "@/components/ui/separator";
import { categories } from "@/lib/catalog";

export function SiteFooter() {
  return (
    <footer className="bg-muted py-14">
      <div className="content-shell flex flex-col gap-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <div className="flex max-w-md flex-col gap-4">
            <BrandMark />
            <p className="text-sm leading-6 text-muted-foreground">文件始终留在你的设备上。Anyfile 只使用浏览器本地能力完成读取与预览。</p>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <p className="font-semibold">格式类别</p>
            {categories.slice(0, 3).map((category) => (
              <Link key={category.slug} href={`/categories/${category.slug}`} className="text-muted-foreground hover:text-foreground">{category.name}</Link>
            ))}
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <p className="font-semibold">开始使用</p>
            <Link href="/view" className="text-muted-foreground hover:text-foreground">打开文件</Link>
            <Link href="/formats/pdf" className="text-muted-foreground hover:text-foreground">PDF 查看器</Link>
            <Link href="/formats/json" className="text-muted-foreground hover:text-foreground">JSON 查看器</Link>
          </div>
        </div>
        <Separator />
        <p className="text-xs text-muted-foreground">© 2026 Anyfile. Local first, privacy always.</p>
      </div>
    </footer>
  );
}
